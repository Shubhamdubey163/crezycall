/** Age from date_of_birth (YYYY-MM-DD or Date) */
function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const md = t.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && t.getDate() < b.getDate())) age -= 1;
  return age;
}

function customerDisplayName(name, age, gender) {
  const parts = [name || 'User'];
  if (age != null) parts.push(String(age));
  if (gender) parts.push(gender);
  return parts.join(', ');
}

module.exports = { calcAge, customerDisplayName };
