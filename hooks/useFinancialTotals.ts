import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Transaction, UserRole, UserProfile } from "../types";
import { BRAND } from "../constants";

export default function useFinancialTotals(user: UserProfile) {
  const [totalValuation, setTotalValuation] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [settledRevenue, setSettledRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const isAdminUser = user.role === UserRole.ADMIN && user.email.endsWith(BRAND.domain);
    const transactionsRef = collection(db, "transactions");

    // Base query: all transactions (filter deleted client-side to avoid index requirements)
    let q;
    if (isAdminUser) {
      q = query(transactionsRef);
    } else {
      if (user.assignedUnit && user.assignedUnit !== 'ALL') {
        q = query(transactionsRef, where("unit", "==", user.assignedUnit));
      } else {
        q = query(transactionsRef, where("createdBy", "==", user.uid));
      }
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      let outstandingTotal = 0;

      snapshot.forEach((doc) => {
        const t = { id: doc.id, ...doc.data() } as Transaction;
        
        // Filter deleted and proforma client-side
        if (t.isDeleted === true || t.type === 'PROFORMA') return;

        // HEAL DATA: Re-derive totals from raw arrays to bypass string concatenation corruption
        const paidAmount = (t.payments || []).reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
        
        const subtotal = Number(t.subtotal || 0);
        const tax = Number(t.taxAmount || 0);
        const sc = Number(t.serviceCharge || 0);
        const disc = Number(t.discountAmount || 0);
        
        const calcExclusive = subtotal + tax + sc - disc;
        const calcInclusive = subtotal - disc;
        const storedTotal = Number(t.totalAmount || 0);
        
        let totalAmount = storedTotal;
        if (Math.abs(storedTotal - calcExclusive) > 1 && Math.abs(storedTotal - calcInclusive) > 1) {
          totalAmount = calcExclusive;
        }
        
        const balance = Math.max(0, totalAmount - paidAmount);

        total += totalAmount;
        outstandingTotal += balance;
      });

      const settled = total - outstandingTotal;

      setTotalValuation(Number(total.toFixed(2)));
      setOutstanding(Number(outstandingTotal.toFixed(2)));
      setSettledRevenue(Number(settled.toFixed(2)));
      setLoading(false);
    }, (error) => {
      console.error("Financial Totals Subscription Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return { totalValuation, outstanding, settledRevenue, loading };
}
