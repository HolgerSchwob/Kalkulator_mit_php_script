/**
 * Public holidays for Hesse, Germany (Hessen).
 * Used to block dates in the Lieferzeitenrechner calendar.
 * Reformationstag and Allerheiligen are NOT public holidays in Hesse (excluded).
 */

/**
 * Computes Easter Sunday for the given year using the Gauss algorithm.
 */
function getEasterSunday(year) {
    const C = Math.floor(year / 100);
    const N = year - 19 * Math.floor(year / 19);
    const K = Math.floor((C - 17) / 25);
    let I = C - Math.floor(C / 4) - Math.floor((C - K) / 3) + 19 * N + 15;
    I = I - 30 * Math.floor(I / 30);
    I = I - Math.floor(I / 28) * (1 - Math.floor(I / 28) * Math.floor(29 / (I + 1)) * Math.floor((21 - N) / 11));
    const J = year + Math.floor(year / 4) + I + 2 - C + Math.floor(C / 4);
    const L = I - (J - 7 * Math.floor(J / 7));
    const M = 3 + Math.floor((L + 40) / 44);
    const D = L + 28 - 31 * Math.floor(M / 4);
    return new Date(year, M - 1, D, 12, 0, 0, 0);
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

/**
 * Returns all public holidays for Hesse (Hessen), Germany for the given year.
 * Includes: Neujahr, Karfreitag, Ostermontag, Tag der Arbeit, Christi Himmelfahrt,
 * Pfingstmontag, Tag der Deutschen Einheit, 1. and 2. Weihnachtstag.
 * Excludes: Reformationstag (not in Hesse), Allerheiligen (not in Hesse).
 * @param {number} year
 * @returns {Date[]}
 */
export function getHessianHolidays(year) {
    const easter = getEasterSunday(year);
    return [
        new Date(year, 0, 1, 12, 0, 0, 0),   // Neujahr
        addDays(easter, -2),                  // Karfreitag
        addDays(easter, 1),                   // Ostermontag
        new Date(year, 4, 1, 12, 0, 0, 0),   // Tag der Arbeit
        addDays(easter, 39),                  // Christi Himmelfahrt
        addDays(easter, 50),                  // Pfingstmontag
        new Date(year, 9, 3, 12, 0, 0, 0),   // Tag der Deutschen Einheit
        new Date(year, 11, 25, 12, 0, 0, 0), // 1. Weihnachtstag
        new Date(year, 11, 26, 12, 0, 0, 0), // 2. Weihnachtstag
    ];
}

/**
 * Returns YYYY-MM-DD date strings for current and next year's Hessian holidays.
 * Used to block these dates in the Lieferzeitenrechner calendar.
 * @returns {string[]}
 */
export function getHessianHolidaysDateStrings() {
    const thisYear = new Date().getFullYear();
    const nextYear = thisYear + 1;
    const dates = [...getHessianHolidays(thisYear), ...getHessianHolidays(nextYear)];
    return dates.map(d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    });
}
