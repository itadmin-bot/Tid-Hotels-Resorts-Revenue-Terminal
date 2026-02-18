import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  UserProfile, 
  SettlementStatus,
  Room,
  AppSettings
} from '../types';

interface FolioModalProps {
  user: UserProfile;
  onClose: () => void;
}

const FolioModal: React.FC<FolioModalProps> = ({ user, onClose }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [guest, setGuest] = useState({ name: '', idType: 'National ID', idNumber: '', email: '', phone: '' });
  const [reservation, setReservation] = useState({ roomId: '', checkIn: '', checkOut: '', nights: 1 });
  const [paid, setPaid] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
      setRooms(data);
      if (data.length > 0 && !reservation.roomId) {
        setReservation(prev => ({ ...prev, roomId: data[0].id }));
      }
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });

    return () => {
      unsubRooms();
      unsubSettings();
    };
  }, []);

  const selectedRoom = rooms.find(r => r.id === reservation.roomId);
  const total = selectedRoom ? selectedRoom.price * reservation.nights : 0;
  
  // Inclusive Tax
  const vatRate = settings?.vat || 0.075;
  const scRate = settings?.serviceCharge || 0.10;
  const divisor = 1 + vatRate + scRate;
  
  const baseValue = total / divisor;
  const taxAmount = baseValue * vatRate;
  const serviceCharge = baseValue * scRate;
  const balance = total - paid;

  const handleSubmit = async () => {
    if (!guest.name || !reservation.checkIn || !reservation.checkOut || !selectedRoom) {
      alert('Please complete all fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tx = {
        reference: `RES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'FOLIO',
        source: 'App',
        guestName: guest.name,
        identityType: guest.idType,
        idNumber: guest.idNumber,
        email: guest.email,
        phone: guest.phone,
        items: [{
          description: `${selectedRoom.name} (${selectedRoom.type})`,
          quantity: reservation.nights,
          price: selectedRoom.price,
          total: total
        }],
        roomDetails: {
          roomName: selectedRoom.name,
          checkIn: reservation.checkIn,
          checkOut: reservation.checkOut,
          nights: reservation.nights,
          rate: selectedRoom.price
        },
        subtotal: baseValue,
        taxAmount,
        serviceCharge,
        totalAmount: total,
        paidAmount: paid,
        balance,
        status: balance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        createdBy: user.uid,
        userId: user.uid, // Explicit field for security rules
        cashierName: user.displayName,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Save to a centralized 'transactions' collection for unified cross-browser sync
      await addDoc(collection(db, 'transactions'), tx);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error saving reservation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-3xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-[#C8A862]">FOLIO CONTROL HUB</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-700 pb-2">Guest Identity</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <input placeholder="Full Guest Name" className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={guest.name} onChange={(e) => setGuest({...guest, name: e.target.value})} />
              </div>
              <select className="bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={guest.idType} onChange={(e) => setGuest({...guest, idType: e.target.value})}>
                <option>National ID</option>
                <option>Passport</option>
                <option>Driver License</option>
              </select>
              <input placeholder="ID Number" className="bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={guest.idNumber} onChange={(e) => setGuest({...guest, idNumber: e.target.value})} />
              <input placeholder="Email Address" className="bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={guest.email} onChange={(e) => setGuest({...guest, email: e.target.value})} />
              <input placeholder="Contact Phone" className="bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={guest.phone} onChange={(e) => setGuest({...guest, phone: e.target.value})} />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-700 pb-2">Stay Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <select className="col-span-2 bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={reservation.roomId} onChange={(e) => setReservation({...reservation, roomId: e.target.value})}>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name} - ₦{r.price.toLocaleString()}/night</option>
                ))}
              </select>
              <div><label className="text-[10px] text-gray-500 block mb-1">Check In</label><input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={reservation.checkIn} onChange={(e) => setReservation({...reservation, checkIn: e.target.value})} /></div>
              <div><label className="text-[10px] text-gray-500 block mb-1">Check Out</label><input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={reservation.checkOut} onChange={(e) => setReservation({...reservation, checkOut: e.target.value})} /></div>
              <div><label className="text-[10px] text-gray-500 block mb-1">Total Nights</label><input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={reservation.nights} onChange={(e) => setReservation({...reservation, nights: parseInt(e.target.value) || 1})} /></div>
            </div>
          </section>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700 space-y-4">
          <div className="flex justify-between items-center text-gray-400">
            <span className="text-sm">Rate: ₦{selectedRoom?.price.toLocaleString() || 0} x {reservation.nights} nights</span>
            <div className="text-right">
              <div className="text-xs">Total Due (Inclusive)</div>
              <div className="text-xl font-bold text-white">₦{total.toLocaleString()}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1"><label className="text-[10px] text-gray-500 uppercase">Paid</label><input type="number" className="w-full bg-[#13263A] border border-gray-700 rounded p-3 text-xl font-bold text-green-400" value={paid} onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} /></div>
            <div className="flex-1"><label className="text-[10px] text-gray-500 uppercase">Balance</label><div className={`p-3 text-xl font-bold rounded ${balance > 0 ? 'text-red-400' : 'text-gray-400'}`}>₦{balance.toLocaleString()}</div></div>
          </div>
          <button disabled={isSubmitting || !guest.name || rooms.length === 0} onClick={handleSubmit} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-xl hover:bg-[#B69651] transition-all uppercase tracking-widest disabled:opacity-50">{isSubmitting ? 'Confirming...' : 'Generate Folio'}</button>
        </div>
      </div>
    </div>
  );
};

export default FolioModal;