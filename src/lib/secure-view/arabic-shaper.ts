/**
 * Minimal Arabic presentation-form shaper.
 *
 * pdf-lib draws raw glyphs with no OpenType shaping, so Arabic text must be
 * converted to its contextual presentation forms before it is written into a
 * PDF. Ordering is NOT handled here: fontkit applies the bidi reordering for
 * right-to-left runs when pdf-lib lays the text out, so the shaper returns the
 * presentation forms in logical order. Reversing them here would cancel that
 * reordering and render the line back-to-front.
 *
 * Coverage: the standard Arabic block plus the lam-alef ligatures, which is all
 * the watermark needs (office name, viewer name, timestamp).
 */

type Forms = [number, number?, number?, number?]; // isolated, final, initial, medial

const FORMS: Record<number, Forms> = {
  0x0621: [0xfe80],
  0x0622: [0xfe81, 0xfe82],
  0x0623: [0xfe83, 0xfe84],
  0x0624: [0xfe85, 0xfe86],
  0x0625: [0xfe87, 0xfe88],
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  0x0627: [0xfe8d, 0xfe8e],
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  0x0629: [0xfe93, 0xfe94],
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98],
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8],
  0x062f: [0xfea9, 0xfeaa],
  0x0630: [0xfeab, 0xfeac],
  0x0631: [0xfead, 0xfeae],
  0x0632: [0xfeaf, 0xfeb0],
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4],
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0],
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  0x0648: [0xfeed, 0xfeee],
  0x0649: [0xfeef, 0xfef0],
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
  0x0671: [0xfb50, 0xfb51],
};

/** ل + ا/آ/أ/إ → حرف واحد (ligature) بشكلين: مفرد ومتصل بما قبله. */
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc],
};

const TATWEEL = 0x0640;

function isMark(code: number): boolean {
  return (
    (code >= 0x064b && code <= 0x065f) ||
    (code >= 0x0610 && code <= 0x061a) ||
    code === 0x0670 ||
    (code >= 0x06d6 && code <= 0x06ed)
  );
}

function isArabicLetter(code: number): boolean {
  return code === TATWEEL || code in FORMS;
}

/** الحرف يقبل الوصل بما يليه (له شكل ابتدائي). */
function connectsForward(code: number): boolean {
  if (code === TATWEEL) return true;
  const forms = FORMS[code];
  return !!forms && forms.length === 4;
}

/** الحرف يقبل الوصل بما قبله (له شكل نهائي). */
function connectsBackward(code: number): boolean {
  if (code === TATWEEL) return true;
  const forms = FORMS[code];
  return !!forms && forms.length >= 2;
}

/**
 * محرف لاتيني قوي الاتجاه (أرقام وحروف لاتينية).
 */
function isLtr(code: number): boolean {
  return (
    (code >= 0x0030 && code <= 0x0039) ||
    (code >= 0x0041 && code <= 0x005a) ||
    (code >= 0x0061 && code <= 0x007a)
  );
}

/**
 * علامات محايدة تُلحق بمقطع لاتيني إذا كانت محصورة بين محرفين لاتينيين، مثل
 * فواصل التواريخ والأوقات والمعرّفات والمسافة بين المبلغ ورمز العملة.
 */
const NEUTRAL_JOINERS = new Set<number>(
  [".", ",", "-", "/", ":", "+", "_", "@", "#", "%", "&", "*", "="].map((ch) => ch.codePointAt(0)!),
);

const MIRRORED: Record<number, number> = {
  0x0028: 0x0029, // ( )
  0x0029: 0x0028,
  0x005b: 0x005d, // [ ]
  0x005d: 0x005b,
  0x007b: 0x007d, // { }
  0x007d: 0x007b,
  0x003c: 0x003e, // < >
  0x003e: 0x003c,
};

/**
 * fontkit يعكس تسلسل المحارف بالكامل عند تخطيط مقطع عربي في PDF، ولا يفصل
 * مقاطع الأرقام واللاتينية عن ذلك العكس. لذلك نعكس هذه المقاطع مسبقاً كي
 * يُعيدها عكس fontkit إلى ترتيبها الصحيح (17/08/2026 وليس 6202/80/71)،
 * ونقلب الأقواس الواقعة في السياق العربي لأنها تُرسم بعد العكس.
 */
function prepareForRtlLayout(shaped: number[]): number[] {
  const isLtrRun = shaped.map((code) => isLtr(code));

  for (let i = 0; i < shaped.length; i += 1) {
    if (isLtrRun[i] || !NEUTRAL_JOINERS.has(shaped[i]!)) continue;
    let before = i - 1;
    while (before >= 0 && !isLtr(shaped[before]!) && NEUTRAL_JOINERS.has(shaped[before]!))
      before -= 1;
    let after = i + 1;
    while (after < shaped.length && !isLtr(shaped[after]!) && NEUTRAL_JOINERS.has(shaped[after]!))
      after += 1;
    if (before >= 0 && after < shaped.length && isLtr(shaped[before]!) && isLtr(shaped[after]!)) {
      for (let k = before + 1; k < after; k += 1) isLtrRun[k] = true;
    }
  }

  const out: number[] = [];
  let index = 0;
  while (index < shaped.length) {
    if (!isLtrRun[index]) {
      const code = shaped[index]!;
      out.push(MIRRORED[code] ?? code);
      index += 1;
      continue;
    }
    let end = index;
    while (end < shaped.length && isLtrRun[end]) end += 1;
    for (let k = end - 1; k >= index; k -= 1) out.push(shaped[k]!);
    index = end;
  }
  return out;
}

/**
 * يحوّل نصاً عربياً إلى أشكال العرض المتصلة مع الحفاظ على الترتيب المنطقي
 * للقراءة، ثم يهيّئ مقاطع الأرقام واللاتينية لعكس fontkit. النتيجة سطر عربي
 * متصل وطبيعي القراءة داخل PDF مع أرقام وتواريخ بترتيبها الصحيح.
 */
export function shapeArabic(input: string): string {
  const codes = Array.from(input)
    .map((ch) => ch.codePointAt(0)!)
    .filter((code) => !isMark(code));

  const shaped: number[] = [];
  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i]!;

    if (code === 0x0644) {
      const next = codes[i + 1];
      const ligature = next !== undefined ? LAM_ALEF[next] : undefined;
      if (ligature) {
        const prev = codes[i - 1];
        const joinBefore = prev !== undefined && connectsForward(prev);
        shaped.push(joinBefore ? ligature[1] : ligature[0]);
        i += 1;
        continue;
      }
    }

    if (!isArabicLetter(code)) {
      shaped.push(code);
      continue;
    }
    if (code === TATWEEL) {
      shaped.push(code);
      continue;
    }

    const forms = FORMS[code]!;
    const prev = codes[i - 1];
    const next = codes[i + 1];
    const joinBefore = prev !== undefined && isArabicLetter(prev) && connectsForward(prev);
    const joinAfter =
      next !== undefined && isArabicLetter(next) && connectsBackward(next) && connectsForward(code);

    let form = forms[0];
    if (joinBefore && joinAfter) form = forms[3] ?? forms[1] ?? forms[0];
    else if (joinBefore) form = forms[1] ?? forms[0];
    else if (joinAfter) form = forms[2] ?? forms[0];
    shaped.push(form);
  }

  return prepareForRtlLayout(shaped)
    .map((code) => String.fromCodePoint(code))
    .join("");
}
