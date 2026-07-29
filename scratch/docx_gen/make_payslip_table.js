const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = require('docx');

const makeCell = (text, isBold = false) => {
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ text: text, bold: isBold, size: 24 })],
            alignment: AlignmentType.LEFT
        })],
        margins: { top: 100, bottom: 100, left: 100, right: 100 }
    });
};

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({ text: "Payslip Logic Format", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: "", spacing: { after: 400 } }),
            
            // The Table
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
                },
                rows: [
                    new TableRow({
                        children: [
                            makeCell("EARNINGS", true),
                            makeCell("FORMULA / SOURCE", true),
                            makeCell("DEDUCTIONS", true),
                            makeCell("FORMULA / SOURCE", true),
                        ]
                    }),
                    new TableRow({
                        children: [
                            makeCell("Basic"),
                            makeCell("FT: Fixed Monthly Salary\nPT: Hourly Rate × 240"),
                            makeCell("ESI"),
                            makeCell("Manual Input / Standard %"),
                        ]
                    }),
                    new TableRow({
                        children: [
                            makeCell("Holiday Pay / OT"),
                            makeCell("Manual Input (Overtime)"),
                            makeCell("Billing Difference"),
                            makeCell("Aggregated Shortages / Advances"),
                        ]
                    }),
                    new TableRow({
                        children: [
                            makeCell(""),
                            makeCell(""),
                            makeCell("LOP (Loss of Pay)"),
                            makeCell("FT: (LOP Days × Daily Rate) + (LOP Hours × Hourly Rate)\nPT: Theoretical Basic - Earned"),
                        ]
                    }),
                    new TableRow({
                        children: [
                            makeCell("Gross Earnings", true),
                            makeCell("Basic + Holiday Pay", true),
                            makeCell("Gross Deductions", true),
                            makeCell("ESI + Billing Diff + LOP", true),
                        ]
                    }),
                ]
            }),
            new Paragraph({ text: "", spacing: { before: 400 } }),
            new Paragraph({ 
                children: [
                    new TextRun({ text: "NET SALARY = Gross Earnings - Gross Deductions", bold: true, size: 28 })
                ],
                alignment: AlignmentType.CENTER 
            }),
            
            new Paragraph({ text: "", spacing: { before: 400 } }),
            new Paragraph({ text: "Notes on calculations:", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: "• FT (Full-Time): Expected minutes calculated dynamically based on (Total Days - 4) * Shift Hours. Any deficit triggers exact LOP." }),
            new Paragraph({ text: "• PT (Part-Time): System mathematically injects a 'dummy' LOP to absorb unworked hours, ensuring the Net Salary on the payslip matches exactly (Hourly Wage × Hours Worked)." })
        ],
    }],
});

const outPath = path.join(__dirname, '..', '..', 'Payslip Logic.docx');

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(outPath, buffer);
    console.log("SUCCESS");
});
