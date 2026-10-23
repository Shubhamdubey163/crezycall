/** Deposit offers: pay X get Y coins */
const DEPOSIT_OFFERS = [
  { id: 'o50', pay: 50, credit: 50, bonus: 0, best: true, label: '₹50' },
  { id: 'o99', pay: 99, credit: 99, bonus: 0, best: true, label: '₹99' },
  { id: 'o199', pay: 199, credit: 199, bonus: 0, best: true, label: '₹199' },
  { id: 'o299', pay: 299, credit: 304, bonus: 5, best: false, label: '₹299→304' },
  { id: 'o500', pay: 500, credit: 520, bonus: 20, best: false, label: '₹500→520' },
  { id: 'o800', pay: 800, credit: 900, bonus: 100, best: false, label: '₹800→900' },
  { id: 'o399', pay: 399, credit: 399, bonus: 0, best: false, label: '₹399' },
  { id: 'o499', pay: 499, credit: 499, bonus: 0, best: false, label: '₹499' },
  { id: 'o100', pay: 100, credit: 105, bonus: 5, label: '₹100 → ₹105 coins' },
  { id: 'o200', pay: 200, credit: 215, bonus: 15, label: '₹200 → ₹215 coins' },
  { id: 'o300', pay: 300, credit: 325, bonus: 25, label: '₹300 → ₹325 coins' },
];

function getOffer(offerId) {
  return DEPOSIT_OFFERS.find((o) => o.id === offerId);
}

function getOfferByPay(amount) {
  return DEPOSIT_OFFERS.find((o) => o.pay === amount);
}

module.exports = { DEPOSIT_OFFERS, getOffer, getOfferByPay };
