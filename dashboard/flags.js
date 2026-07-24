/**
 * flags.js — drop-in flag helper for Zamil SMS dashboard
 *
 * Your existing render code (in app.js) builds each row in #rangesList
 * and #numList. Wherever it currently writes something like:
 *
 *     `<div class="range-flag">${someText}</div>`
 *
 * replace `someText` with a call to one of these two functions.
 * Nothing else needs to change — the CSS chip (.range-flag) already
 * expects either plain text (emoji) or an <img> inside it.
 *
 * USAGE
 * -----
 *   getFlagEmoji('US')                 -> "🇺🇸"                     (fast, zero network)
 *   getFlagImgHTML('US', 40)           -> '<img src="https://flagcdn.com/w40/us.png" ...>'
 *                                          (crisp on Windows/Linux where emoji flags
 *                                           often render as plain letters or boxes)
 *
 * If your range objects store a calling code (e.g. "+1") instead of an
 * ISO code, use callingCodeToISO() first: callingCodeToISO('+92') -> 'PK'
 */
(function (global) {
  // Minimal calling-code -> ISO map for the ranges you're most likely to sell.
  // Add more pairs as needed — unmatched codes fall back to a globe icon.
  const CALLING_CODE_TO_ISO = {
    '1': 'US', '7': 'RU', '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL',
    '32': 'BE', '33': 'FR', '34': 'ES', '39': 'IT', '40': 'RO', '41': 'CH',
    '44': 'GB', '45': 'DK', '46': 'SE', '47': 'NO', '48': 'PL', '49': 'DE',
    '51': 'PE', '52': 'MX', '53': 'CU', '54': 'AR', '55': 'BR', '56': 'CL',
    '57': 'CO', '58': 'VE', '60': 'MY', '61': 'AU', '62': 'ID', '63': 'PH',
    '64': 'NZ', '65': 'SG', '66': 'TH', '81': 'JP', '82': 'KR', '84': 'VN',
    '86': 'CN', '90': 'TR', '91': 'IN', '92': 'PK', '93': 'AF', '94': 'LK',
    '95': 'MM', '98': 'IR', '212': 'MA', '213': 'DZ', '216': 'TN', '218': 'LY',
    '220': 'GM', '221': 'SN', '234': 'NG', '233': 'GH', '254': 'KE', '255': 'TZ',
    '256': 'UG', '260': 'ZM', '263': 'ZW', '351': 'PT', '352': 'LU', '353': 'IE',
    '354': 'IS', '358': 'FI', '359': 'BG', '370': 'LT', '371': 'LV', '372': 'EE',
    '380': 'UA', '420': 'CZ', '421': 'SK', '852': 'HK', '853': 'MO', '855': 'KH',
    '856': 'LA', '880': 'BD', '886': 'TW', '960': 'MV', '961': 'LB', '962': 'JO',
    '963': 'SY', '964': 'IQ', '965': 'KW', '966': 'SA', '967': 'YE', '968': 'OM',
    '970': 'PS', '971': 'AE', '972': 'IL', '973': 'BH', '974': 'QA', '975': 'BT',
    '976': 'MN', '977': 'NP', '992': 'TJ', '993': 'TM', '994': 'AZ', '995': 'GE',
    '996': 'KG', '998': 'UZ'
  };

  function callingCodeToISO(callingCode) {
    if (!callingCode) return null;
    const digits = String(callingCode).replace(/[^0-9]/g, '');
    // Try longest match first (3, then 2, then 1 digit codes)
    for (const len of [3, 2, 1]) {
      const candidate = digits.slice(0, len);
      if (CALLING_CODE_TO_ISO[candidate]) return CALLING_CODE_TO_ISO[candidate];
    }
    return null;
  }

  function getFlagEmoji(isoCode) {
    if (!isoCode || isoCode.length !== 2) return '🌐';
    const codePoints = isoCode
      .toUpperCase()
      .split('')
      .map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  function getFlagImgHTML(isoCode, size) {
    size = size || 40;
    if (!isoCode || isoCode.length !== 2) {
      return '<span aria-hidden="true">🌐</span>';
    }
    const code = isoCode.toLowerCase();
    return (
      '<img src="https://flagcdn.com/w' + size + '/' + code + '.png" ' +
      'srcset="https://flagcdn.com/w' + (size * 2) + '/' + code + '.png 2x" ' +
      'alt="' + isoCode.toUpperCase() + ' flag" loading="lazy" width="' + size + '">'
    );
  }

  global.callingCodeToISO = callingCodeToISO;
  global.getFlagEmoji = getFlagEmoji;
  global.getFlagImgHTML = getFlagImgHTML;
})(window);
