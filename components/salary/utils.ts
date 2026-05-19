export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const getCurrentMonthStr = () => {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
};

export const formatMonthDisplay = (monthStr: string) => {
  // monthStr is YYYY-MM
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const getPastMonths = (count: number) => {
  const months = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(m.toISOString().slice(0, 7));
  }
  return months;
};
