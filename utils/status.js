export const normalizeShopifyStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (['paid', 'partially_paid'].includes(s)) return 'paid';
  if (['voided', 'refunded', 'cancelled', 'failed'].includes(s)) return 'cancelled';
  if (s === 'fulfilled') return 'fulfilled';
  if (['authorized'].includes(s)) return 'authorized';
  return 'pending';
};

export const normalizePayLaterStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (['success', 'paid'].includes(s)) return 'paid';
  if (['failed', 'cancelled'].includes(s)) return 'failed';
  return 'pending';
};
