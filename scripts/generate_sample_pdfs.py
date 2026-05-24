from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "generated_samples"
OUT_DIR.mkdir(parents=True, exist_ok=True)

class SamplePdf(FPDF):
    def header(self):
        self.set_fill_color(122, 31, 31)
        self.rect(0, 0, 210, 28, style="F")
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 16)
        self.set_y(8)
        self.cell(0, 8, self.title_text, align="L")
        self.ln(15)

    def footer(self):
        self.set_y(-15)
        self.set_draw_color(210, 210, 210)
        self.line(12, self.get_y(), 198, self.get_y())
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(90, 90, 90)
        self.cell(0, 8, self.footer_text, align="L")


def create_pdf(title_text, footer_text):
    pdf = SamplePdf()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.title_text = title_text
    pdf.footer_text = footer_text
    pdf.add_page()
    pdf.set_text_color(35, 35, 35)
    return pdf


def section(pdf, title):
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(35, 35, 35)
    pdf.cell(0, 8, title, ln=True)
    pdf.set_draw_color(210, 210, 210)
    pdf.line(12, pdf.get_y(), 198, pdf.get_y())
    pdf.ln(4)


def labeled_row(pdf, label, value):
    pdf.set_fill_color(248, 245, 245)
    pdf.set_draw_color(210, 210, 210)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(45, 9, label, border=1, fill=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(145, 9, value, border=1, ln=1)


def bullet(pdf, text):
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(10)
    pdf.multi_cell(190, 6, f"- {text}")


def save_pdf(pdf, path):
    pdf.output(str(path))


def build_tor_pdf():
    pdf = create_pdf("SAMPLE TRANSCRIPT OF RECORDS (TOR)", "Sample only. Not valid as an official academic record.")
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(0, 7, "For demonstration only - not an official school document")

    section(pdf, "Student Information")
    for label, value in [
        ("Student Name", "Juan Dela Cruz"),
        ("Student No.", "2021-01567"),
        ("Program", "Bachelor of Science in Information Technology (BSIT)"),
        ("School", "Sample City College"),
        ("Academic Status", "Completed 2 academic years"),
        ("Date Issued", "May 22, 2026"),
    ]:
        labeled_row(pdf, label, value)

    section(pdf, "Summary")
    pdf.multi_cell(0, 6, "This sample TOR shows more than 60 total units and contains multiple IT-related subjects to match a BSIT prequalification review.")

    section(pdf, "Subjects and Grades")
    rows = [
        ["1st Year - 1st Sem", "IT 101", "Introduction to Computing", "3", "1.75"],
        ["", "IT 102", "Computer Programming 1", "3", "1.50"],
        ["", "MATH 101", "Discrete Mathematics", "3", "1.75"],
        ["", "GE 101", "Understanding the Self", "3", "1.50"],
        ["", "IT 103", "PC Hardware and Troubleshooting", "3", "1.25"],
        ["1st Year - 2nd Sem", "IT 104", "Computer Programming 2", "3", "1.50"],
        ["", "IT 105", "Web Development Fundamentals", "3", "1.25"],
        ["", "IT 106", "Database Management Systems", "3", "1.50"],
        ["", "IT 107", "Networking Fundamentals", "3", "1.75"],
        ["", "GE 102", "Readings in Philippine History", "3", "1.50"],
        ["2nd Year - 1st Sem", "IT 201", "Object-Oriented Programming", "3", "1.50"],
        ["", "IT 202", "Human Computer Interaction", "3", "1.25"],
        ["", "IT 203", "Systems Analysis and Design", "3", "1.50"],
        ["", "IT 204", "Information Security", "3", "1.50"],
        ["", "GE 103", "The Contemporary World", "3", "1.75"],
        ["2nd Year - 2nd Sem", "IT 205", "Advanced Web Design", "3", "1.25"],
        ["", "IT 206", "Mobile Application Development", "3", "1.50"],
        ["", "IT 207", "Capstone Project 1", "3", "1.50"],
        ["", "IT 208", "IT Elective: UI/UX Design", "3", "1.25"],
        ["", "NSTP 2", "National Service Training Program 2", "3", "Passed"],
    ]
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(122, 31, 31)
    headers = ["Term", "Code", "Subject Title", "Units", "Grade"]
    widths = [42, 24, 90, 18, 16]
    for header, width in zip(headers, widths):
        pdf.cell(width, 8, header, border=1, fill=True, align="C")
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 8)
    for row in rows:
        pdf.cell(widths[0], 8, row[0], border=1)
        pdf.cell(widths[1], 8, row[1], border=1)
        pdf.cell(widths[2], 8, row[2], border=1)
        pdf.cell(widths[3], 8, row[3], border=1, align="C")
        pdf.cell(widths[4], 8, row[4], border=1, align="C")
        pdf.ln(8)

    pdf.ln(3)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, "IT-related subjects included: IT 101, IT 102, IT 103, IT 104, IT 105, IT 106, IT 107, IT 201, IT 202, IT 203, IT 204, IT 205, IT 206, IT 207, IT 208.")
    save_pdf(pdf, OUT_DIR / "sample_bsit_tor.pdf")


def build_job_pdf():
    pdf = create_pdf("SAMPLE JOB DESCRIPTION", "Sample only. Not an actual hiring document.")
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(0, 7, "Role: Web Designer | Experience Level: 5 Years")

    section(pdf, "Job Overview")
    for label, value in [
        ("Company", "Creative Pixel Studio"),
        ("Department", "Design and Digital Experience"),
        ("Job Title", "Web Designer"),
        ("Experience Required", "5 years"),
        ("Employment Type", "Full-time"),
        ("Location", "Remote / Hybrid"),
    ]:
        labeled_row(pdf, label, value)

    section(pdf, "Job Summary")
    pdf.multi_cell(0, 6, "The Web Designer creates visually compelling and accessible website interfaces, collaborates with developers and content teams, and maintains a consistent digital brand across web pages and landing experiences.")

    section(pdf, "Key Responsibilities")
    responsibilities = [
        "Design responsive website layouts, landing pages, and reusable UI components.",
        "Create wireframes, mockups, and interactive prototypes for stakeholder review.",
        "Translate brand guidelines into polished web visuals and page templates.",
        "Work closely with front-end developers to ensure design accuracy and usability.",
        "Optimize graphics, typography, spacing, and interaction flow for modern web standards.",
        "Review and improve accessibility, readability, and mobile responsiveness.",
        "Support A/B testing and design iteration based on user feedback and analytics.",
    ]
    for item in responsibilities:
        bullet(pdf, item)

    section(pdf, "Required Qualifications")
    qualifications = [
        "At least 5 years of experience in web design, UX/UI, or digital product design.",
        "Strong portfolio demonstrating modern websites, landing pages, and responsive layouts.",
        "Proficiency in Figma, Adobe XD, Photoshop, Illustrator, or equivalent design tools.",
        "Solid understanding of HTML, CSS, and front-end design constraints.",
        "Experience working with developers in Agile or cross-functional teams.",
        "Good knowledge of accessibility, responsive design, and visual hierarchy.",
    ]
    for item in qualifications:
        bullet(pdf, item)

    section(pdf, "Preferred Skills")
    preferred = [
        "Motion design and micro-interaction planning.",
        "Basic familiarity with content management systems.",
        "Photography editing and iconography support.",
        "Experience with design systems and component libraries.",
    ]
    for item in preferred:
        bullet(pdf, item)

    section(pdf, "Note")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, "This document is a sample job description for demonstration purposes only.")
    save_pdf(pdf, OUT_DIR / "sample_web_designer_job_description.pdf")


if __name__ == "__main__":
    build_tor_pdf()
    build_job_pdf()
    print(f"Created: {OUT_DIR / 'sample_bsit_tor.pdf'}")
    print(f"Created: {OUT_DIR / 'sample_web_designer_job_description.pdf'}")
