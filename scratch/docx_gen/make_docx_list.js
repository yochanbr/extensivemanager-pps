const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

function makeEntry(name, calculation) {
    return new Paragraph({
        children: [
            new TextRun({ text: name + " = ", bold: true }),
            new TextRun({ text: "[ " + calculation + " ]" })
        ],
        spacing: { after: 120 }
    });
}

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({ text: "Payslip Box Logic", heading: HeadingLevel.TITLE }),
            new Paragraph({ text: "", spacing: { after: 200 } }),
            
            new Paragraph({ text: "Identification Boxes", heading: HeadingLevel.HEADING_1 }),
            makeEntry("Employee ID", "Fetched from secure database ID registry"),
            makeEntry("Location", "Fetched from employee regional profile, defaults to 'SULLIA, KARNATAKA'"),
            makeEntry("Employee Name", "Fetched from secure database, converted to UPPERCASE"),
            makeEntry("Joining Date", "Fetched from employment records or 'NOT SPECIFIED'"),
            makeEntry("Bank Name", "Fetched from encrypted financial records"),
            makeEntry("A/C Number", "Fetched from encrypted financial records"),
            makeEntry("PAN Number", "Fetched from statutory tax records"),
            makeEntry("PF UAN Number", "Fetched from statutory provident fund records"),
            makeEntry("ESI Number", "Fetched from statutory insurance records"),
            makeEntry("PF Number", "Fetched from statutory provident fund records"),
            
            new Paragraph({ text: "", spacing: { after: 200 } }),
            new Paragraph({ text: "Attendance Metrics Boxes", heading: HeadingLevel.HEADING_1 }),
            makeEntry("STD Days", "The total calendar days in the selected month"),
            makeEntry("Worked Days", "Total Worked Minutes across all daily sessions ÷ Standard Shift Minutes. Rounded to 1 decimal"),
            makeEntry("LOP Days", "Full-Time: floor((Required Monthly Minutes - Total Worked Minutes) ÷ Shift Minutes). Part-Time: Calculated as floor(30 - Worked Hours ÷ 8)"),
            makeEntry("Leave Balance", "Manually configured during generation or defaults to 2"),
            
            new Paragraph({ text: "", spacing: { after: 200 } }),
            new Paragraph({ text: "Earnings Boxes", heading: HeadingLevel.HEADING_1 }),
            makeEntry("Basic", "Full-Time: The fixed monthly salary configuration. Part-Time: Extrapolated base salary calculated as (Hourly Rate × 240 hours)"),
            makeEntry("Holiday Pay / OT", "Manual input amount specified during Payslip generation"),
            makeEntry("Gross Earnings", "Sum of Basic + Holiday Pay / OT"),
            
            new Paragraph({ text: "", spacing: { after: 200 } }),
            new Paragraph({ text: "Deductions Boxes", heading: HeadingLevel.HEADING_1 }),
            makeEntry("ESI", "Manual deduction input specified during Payslip generation"),
            makeEntry("Billing Difference", "Automatically aggregated sum of shortages/advances from Daily Shift Closure ESR Reports across the month"),
            makeEntry("LOP (Loss of Pay)", "Full-Time: (LOP Days × Daily Rate) + (LOP Hours × Hourly Rate). Part-Time: Normalization deduction calculated as (Basic - Earned Salary)"),
            makeEntry("Gross Deductions", "Sum of ESI + Billing Difference + LOP"),
            
            new Paragraph({ text: "", spacing: { after: 200 } }),
            new Paragraph({ text: "Totals Boxes", heading: HeadingLevel.HEADING_1 }),
            makeEntry("NET SALARY", "Gross Earnings - Gross Deductions"),
            makeEntry("Net Salary (Rupees in Words)", "Algorithmic translation of the Net Salary integer into Indian Rupees text"),
        ],
    }],
});

const outPath = path.join(__dirname, '..', '..', 'Payslip Logic.docx');

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(outPath, buffer);
    console.log("SUCCESS");
}).catch(err => console.error(err));
