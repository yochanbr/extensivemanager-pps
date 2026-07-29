const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({
                text: "Payslip Formula Logic",
                heading: HeadingLevel.TITLE,
            }),
            new Paragraph({ text: "", spacing: { after: 200 } }),
            
            // Full-Time
            new Paragraph({
                text: "Full-Time Employees",
                heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: "• Required Minutes = (Total Days in Month - 4) × (End Time - Start Time)" }),
            new Paragraph({ text: "• Total Worked Minutes = Sum of all (Check-out Time - Check-in Time)" }),
            new Paragraph({ text: "• Lost Minutes = Required Minutes - Total Worked Minutes" }),
            new Paragraph({ text: "• LOP Days = floor(Lost Minutes ÷ Shift Duration)" }),
            new Paragraph({ text: "• LOP Hours = (Lost Minutes % Shift Duration) ÷ 60" }),
            new Paragraph({ text: "• LOP Amount = (LOP Days × Daily Rate) + (LOP Hours × Hourly Rate)" }),
            new Paragraph({ text: "• Net Salary = Basic Salary - LOP Amount - ESI Deduction - PF Deduction + Advances", spacing: { after: 400 } }),
            
            // Part-Time
            new Paragraph({
                text: "Part-Time Employees",
                heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: "• Theoretical Basic Salary = Hourly Rate × 240" }),
            new Paragraph({ text: "• Worked Hours = Total Worked Minutes ÷ 60" }),
            new Paragraph({ text: "• Earned Salary = Hourly Rate × Worked Hours" }),
            new Paragraph({ text: "• LOP Amount = Theoretical Basic Salary - Earned Salary" }),
            new Paragraph({ text: "• Net Salary = Theoretical Basic Salary - LOP Amount", spacing: { after: 400 } }),

            // Glossary
            new Paragraph({
                text: "Glossary / Abbreviations",
                heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: "• LOP = Loss of Pay" }),
            new Paragraph({ text: "• ESI = Employee State Insurance" }),
            new Paragraph({ text: "• PF = Provident Fund" }),
            new Paragraph({ text: "• floor = Round down to the nearest whole number" }),
            new Paragraph({ text: "• % = Modulo (The remainder after division)" }),
        ],
    }],
});

const outPath = path.join(__dirname, '..', '..', 'Formula_Logic_of_Payslip_v2.docx');

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(outPath, buffer);
    console.log("SUCCESS: Created DOCX successfully at " + outPath);
}).catch(err => {
    console.error("ERROR generating docx:", err);
});
