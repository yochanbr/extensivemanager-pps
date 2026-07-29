const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({ text: "Ultimate Payslip Logic & Row-by-Row Breakdown", heading: HeadingLevel.TITLE }),
            new Paragraph({ text: "", spacing: { after: 200 } }),
            
            new Paragraph({ text: "1. Header & Identity Section", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "• Employee ID: Fetched from database 'username' or 'employee-id'." }),
            new Paragraph({ text: "• Employee Name: Full Name in UPPERCASE." }),
            new Paragraph({ text: "• Location: Store location or 'SULLIA, KARNATAKA' default." }),
            new Paragraph({ text: "• Joining Date: Fetched from database." }),
            new Paragraph({ text: "• Bank Name, A/C Number, PAN Number, PF UAN Number: Fetched from employee's financial profile." }),
            new Paragraph({ text: "• ESI Number / PF Number: Statutory IDs fetched from database.", spacing: { after: 200 } }),
            
            new Paragraph({ text: "2. Attendance & Metrics Section", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "• STD Days (Standard Days): The total number of days in the current month." }),
            new Paragraph({ text: "• Worked Days: Calculated dynamically. (Total Worked Minutes ÷ Standard Shift Minutes). Rounded to 1 decimal." }),
            new Paragraph({ text: "• LOP Days (Loss of Pay Days): Calculated by the backend (Required Working Minutes - Total Worked Minutes) ÷ Shift Minutes." }),
            new Paragraph({ text: "• Leave Balance: Remaining leaves for the employee (Default 2 if not explicitly tracked).", spacing: { after: 200 } }),
            
            new Paragraph({ text: "3. Earnings Column", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "• Basic:" }),
            new Paragraph({ text: "    - Full-Time: The fixed Monthly Basic Salary entered in the HR portal." }),
            new Paragraph({ text: "    - Part-Time: Treated as 'Theoretical Monthly Budget'. Calculated as (Hourly Rate × 240 hours)." }),
            new Paragraph({ text: "• Holiday Pay / OT (Overtime): Additional pay calculated or manually injected during the payslip generation config step for working on holidays/extra hours." }),
            new Paragraph({ text: "• Gross Earnings: Sum of (Basic + Holiday Pay / OT).", spacing: { after: 200 } }),
            
            new Paragraph({ text: "4. Deductions Column", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "• ESI: Employee State Insurance deduction amount." }),
            new Paragraph({ text: "• Billing Difference: Advances, loans, or cash register shortages. Automatically aggregated from ESR (Shift Closure) reports throughout the month, or manually overridden." }),
            new Paragraph({ text: "• LOP (Loss of Pay Amount):" }),
            new Paragraph({ text: "    - Full-Time: (LOP Days × Daily LOP Rate) + (LOP Remaining Hours × Hourly LOP Rate)." }),
            new Paragraph({ text: "    - Part-Time: (Theoretical Basic Salary) - (Hourly Rate × Actual Worked Hours). This acts as a normalization deduction so the payslip format works perfectly." }),
            new Paragraph({ text: "• Gross Deductions: Sum of (ESI + Billing Difference + LOP Amount).", spacing: { after: 200 } }),
            
            new Paragraph({ text: "5. Final Settlement", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "• NET SALARY: Gross Earnings - Gross Deductions." }),
            new Paragraph({ text: "• Net Salary in Words: Algorithmic conversion of the Net Salary integer into Indian Rupees text (e.g. 'Rupees Twelve Thousand Only')." }),
        ],
    }],
});

const outPath = path.join(__dirname, '..', '..', 'paysliplogic.docx');

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(outPath, buffer);
    console.log("SUCCESS: Created DOCX successfully at " + outPath);
}).catch(err => {
    console.error("ERROR generating docx:", err);
});
