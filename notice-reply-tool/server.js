const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const Tesseract = require('tesseract.js');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// ========== TEMPLATES ==========
const TEMPLATES = {
  gst_73: {
    label: 'GST — Section 73 (short payment / ITC mismatch, non-fraud)',
    skeleton: `To,
The [Designation], [Ward/Range/Division]
[Address of the GST office]

Subject: Reply to notice under Section 73 of the CGST/SGST Act, [Notice No.] dated [Date], for the period [FY/period]

Respected Sir/Madam,

1. This is in reference to the above notice raising a demand of Rs. [amount] on account of [ground alleged — e.g. mismatch between GSTR-3B and GSTR-2A/2B, short payment of tax].

2. At the outset, it is submitted that the taxpayer has, at all times, discharged its GST liability correctly and there is no suppression of facts or intent to evade tax, so the proceedings, if any, are confined to Section 73 and not Section 74.

3. On verification of our books of account, the position is as under:
   [Insert reconciliation table / explanation of each figure raised in the notice]

4. [Explain the reason for the difference — timing difference, supplier's delayed filing, clerical error, etc. State only facts you can support with documents.]

5. In view of the above, it is respectfully submitted that [the demand may be dropped / the demand may be restricted to Rs. — / no further tax is payable], and we enclose the following in support: [list documents].

6. We request that an opportunity of personal hearing be granted before any adverse order is passed.

Thanking you,
For [Name of taxpayer/firm]
[Authorised signatory name, designation, GSTIN]`
  },
  gst_74: {
    label: 'GST — Section 74 (fraud / wilful suppression alleged)',
    skeleton: `To,
The [Designation], [Ward/Range/Division]
[Address of the GST office]

Subject: Reply to Show Cause Notice under Section 74 of the CGST/SGST Act, [Notice No.] dated [Date], for the period [FY/period]

Respected Sir/Madam,

1. This has reference to the Show Cause Notice alleging [ground — e.g. wrongful availment of ITC / suppression of outward supply] and invoking the extended period of limitation under Section 74 on the ground of fraud, wilful misstatement or suppression of facts.

2. It is submitted at the threshold that none of the ingredients of Section 74 — fraud, wilful misstatement, or suppression with intent to evade tax — are made out on the facts of this case, and the proceedings, if at all, ought to be confined to Section 73.

3. Without prejudice to the above, on merits, our books of account show the following position:
   [Insert reconciliation / explanation of each figure raised]

4. [State the bona fide reason for the difference, and that it was disclosed in returns/records — this is central to rebutting "suppression".]

5. It is submitted that full facts were disclosed in the returns filed and there is no concealment; hence invocation of the extended period and penalty under Section 74 is not sustainable.

6. We request that the proceedings be dropped, or in the alternative, that the matter be examined only under Section 73, and that a personal hearing be granted before any order is passed.

Thanking you,
For [Name of taxpayer/firm]
[Authorised signatory name, designation, GSTIN]`
  },
  it_143_2: {
    label: 'Income Tax — Section 143(2) (scrutiny assessment)',
    skeleton: `To,
The Assessing Officer,
[Ward/Circle], [City]

Subject: Submission in response to notice u/s 143(2) dated [Date] — PAN [PAN], AY [Assessment Year]

Respected Sir/Madam,

1. This is with reference to the notice issued under Section 143(2) selecting the return for AY [Year] for scrutiny.

2. The point-wise submission on the issue(s) raised is as under:
   [Address each specific query/reason for selection — books figures, TDS reconciliation, deduction claimed, etc.]

3. The following documents are enclosed in support: [list — e.g. audited financials, ledger extracts, bank statements, Form 26AS reconciliation].

4. It is respectfully submitted that the return filed reflects the correct income and no addition is warranted on the point(s) raised. We remain available for further clarification or personal hearing as may be required.

Thanking you,
For [Assessee name]
[Authorised representative, PAN]`
  },
  tds_200a: {
    label: 'TDS — Section 200A intimation',
    skeleton: `To,
The Assessing Officer (TDS),
[Ward/Circle], [City]

Subject: Reply to intimation u/s 200A for [Form 24Q/26Q], Quarter [Q], FY [Year], TAN [TAN]

Respected Sir/Madam,

1. This has reference to the intimation raising a demand of Rs. [amount] on account of [short deduction / short payment / interest u/s 201(1A) / late fee u/s 234E].

2. On reconciliation with our TDS records and challans, the position is as under:
   [Explain each default flagged]

3. It is submitted that [a correction statement has been filed on — / the challan stands correctly matched / the demand is on account of a data-entry error which stands rectified].

4. It is requested that the demand be revised/withdrawn accordingly.

Thanking you,
For [Deductor name]
[Authorised signatory, TAN]`
  },
  generic: {
    label: 'Generic — no specific section matched',
    skeleton: `To,
The [Officer designation],
[Address]

Subject: Reply to notice [Notice No.] dated [Date]

Respected Sir/Madam,

1. This has reference to the above notice regarding [issue].

2. Our submission on the point(s) raised is as under:
   [Explain each point, with figures reconciled against books]

3. Enclosed in support: [list documents].

4. It is respectfully requested that the matter be considered favourably in light of the above.

Thanking you,
For [Name]
[Authorised signatory]`
  }
};

// ========== EXTRACTION LOGIC ==========
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    console.error('PDF parse error:', err);
    throw new Error('Failed to parse PDF');
  }
}

async function extractTextFromImage(buffer) {
  try {
    const result = await Tesseract.recognize(buffer, 'eng');
    return result.data.text;
  } catch (err) {
    console.error('OCR error:', err);
    throw new Error('Failed to extract text from image');
  }
}

function parseNoticeDetails(text) {
  const lines = text.split('\n');
  const fullText = text.toUpperCase();
  
  // Detect notice type
  let noticeType = 'Unclear';
  if (fullText.includes('CGST') || fullText.includes('SGST')) noticeType = 'GST';
  else if (fullText.includes('INCOME TAX')) noticeType = 'Income Tax';
  else if (fullText.includes('TDS') || fullText.includes('TAX DEDUCTED')) noticeType = 'TDS';
  
  // Detect section
  let section = '';
  const sectionMatch = text.match(/Section\s+(\d+[A-Z]?)/i);
  if (sectionMatch) section = 'Section ' + sectionMatch[1];
  
  // Extract basic info
  const noticeNumberMatch = text.match(/(?:Notice|No\.?)\s+([A-Z0-9\/\-]+)/i);
  const noticeNumber = noticeNumberMatch ? noticeNumberMatch[1] : 'Not found';
  
  const dateMatch = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/g);
  const dateOfNotice = dateMatch ? dateMatch[0] : 'Not found';
  
  const fyMatch = text.match(/(FY|A\.Y\.|Assessment Year)\s+([0-9]{2,4}[\/-][0-9]{2,4}|[0-9]{4})/i);
  const financialYear = fyMatch ? fyMatch[2] : 'Not stated';
  
  const allegationMatch = text.match(/(?:regarding|on account of|alleges?|ground)\s+([^.\n]{20,100})/i);
  const allegation = allegationMatch ? allegationMatch[1].trim() : 'Not clearly stated';
  
  // Extract amounts
  const amountMatches = text.match(/Rs\.?\s+([0-9,]+(?:\.[0-9]{2})?)/gi);
  const amounts = amountMatches ? amountMatches.map(m => m.replace(/[^0-9.,]/g, '')) : [];
  
  const lineItems = amounts.slice(0, 5).map((amt, i) => ({
    particular: `Amount ${i + 1}`,
    notice_amount: parseFloat(amt.replace(/,/g, ''))
  }));
  
  return {
    notice_type: noticeType,
    section: section,
    notice_number: noticeNumber,
    date_of_notice: dateOfNotice,
    financial_year_period: financialYear,
    issuing_authority: 'Tax Authority',
    reply_due_date: 'Check notice',
    allegation_summary: allegation,
    line_items: lineItems,
    extracted_text: text.substring(0, 500)
  };
}

// ========== API ENDPOINTS ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Extract from uploaded file
app.post('/api/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    let text = '';
    
    if (req.file.mimetype === 'application/pdf') {
      text = await extractTextFromPDF(req.file.buffer);
    } else if (req.file.mimetype.startsWith('image/')) {
      text = await extractTextFromImage(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from file' });
    }
    
    const extracted = parseNoticeDetails(text);
    res.json({ extracted });
  } catch (err) {
    console.error('Extract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate reply from extracted notice
app.post('/api/reply', express.json(), (req, res) => {
  try {
    const { notice, figures, instructions, template_key } = req.body;
    
    if (!notice || !template_key) {
      return res.status(400).json({ error: 'Missing notice or template' });
    }
    
    const template = TEMPLATES[template_key] || TEMPLATES.generic;
    let draft = template.skeleton;
    
    // Replace placeholders
    draft = draft.replace(/\[Notice No\.\]/g, notice.notice_number || 'Not provided');
    draft = draft.replace(/\[Date\]/g, notice.date_of_notice || 'Not provided');
    draft = draft.replace(/\[FY\/period\]/g, notice.financial_year_period || 'Not provided');
    draft = draft.replace(/\[amount\]/g, figures[0]?.notice_amount || 'Not provided');
    draft = draft.replace(/\[ground alleged[^\]]*\]/g, notice.allegation_summary || 'Not stated');
    
    // Add reconciliation section
    if (figures && figures.length > 0) {
      let reconciliation = '\n\n   Reconciliation of figures:';
      figures.forEach((f, i) => {
        const diff = f.book_amount ? (f.book_amount - f.notice_amount) : 0;
        reconciliation += `\n   ${i + 1}. ${f.particular || 'Item ' + (i + 1)}: Notice shows Rs. ${f.notice_amount}, our books show Rs. ${f.book_amount || 'N/A'}. ${diff !== 0 ? `Difference: Rs. ${diff}` : 'No difference.'}`;
      });
      draft = draft.replace(/\[Insert reconciliation[^\]]*\]/, reconciliation);
    }
    
    if (instructions) {
      draft = draft.replace(/\[Explain the reason[^\]]*\]/, instructions);
    }
    
    res.json({ draft });
  } catch (err) {
    console.error('Reply generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Quick reply from pasted text
app.post('/api/quick-reply', express.json(), (req, res) => {
  try {
    const { notice_text, instructions, template_key } = req.body;
    
    if (!notice_text || !template_key) {
      return res.status(400).json({ error: 'Missing notice text or template' });
    }
    
    const extracted = parseNoticeDetails(notice_text);
    const template = TEMPLATES[template_key] || TEMPLATES.generic;
    let draft = template.skeleton;
    
    draft = draft.replace(/\[Notice No\.\]/g, extracted.notice_number);
    draft = draft.replace(/\[Date\]/g, extracted.date_of_notice);
    draft = draft.replace(/\[FY\/period\]/g, extracted.financial_year_period);
    draft = draft.replace(/\[ground alleged[^\]]*\]/g, extracted.allegation_summary);
    
    if (instructions) {
      draft = draft.replace(/\[Explain[^\]]*\]/, instructions);
    }
    
    res.json({ draft });
  } catch (err) {
    console.error('Quick reply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✓ Notice Reply Desk Backend running on http://localhost:${PORT}`);
  console.log(`  Frontend: Open http://localhost:${PORT} in your browser\n`);
});
