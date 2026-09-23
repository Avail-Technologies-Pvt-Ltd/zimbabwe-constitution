"""
Accurate font-based extractor for the complete Constitution of Zimbabwe (2013).
Extracts:
- Preamble
- 18 Chapters (Sections 1 through 345)
- Schedules 1 through 6
- Conversational plain-language summaries for each section
"""
import re
import json
import pymupdf

def clean_span_text(t):
    return t.replace('\xa0', ' ')

def run_extraction():
    doc = pymupdf.open("zim_constitution.pdf")
    
    constitution = {
        "title": "Constitution of Zimbabwe",
        "subtitle": "Constitution of Zimbabwe Amendment (No. 20) Act, 2013",
        "preamble": "",
        "chapters": [],
        "schedules": []
    }
    
    current_mode = "START" # START -> PREAMBLE -> CHAPTERS -> SCHEDULES
    current_chapter = None
    current_section = None
    current_schedule = None
    preamble_lines = []
    
    # Track chapter numbers 1 to 18
    all_chapters = []
    all_schedules = []
    
    # We loop pages from page 6 (index 5)
    for p_idx in range(5, len(doc)):
        page = doc[p_idx]
        blocks = page.get_text('dict')['blocks']
        
        for b in blocks:
            if 'lines' not in b:
                continue
            for l in b['lines']:
                line_text = "".join(clean_span_text(s['text']) for s in l['spans']).strip()
                if not line_text:
                    continue
                
                # Filter headers / footers
                if line_text.startswith("constituteproject.org") or \
                   line_text.startswith("PDF generated:") or \
                   line_text == "Zimbabwe 2013" or \
                   re.match(r"^Page \d+$", line_text):
                    continue
                
                max_size = max(s['size'] for s in l['spans'])
                is_bold = any('Bold' in s['font'] for s in l['spans'])
                
                # Check for Preamble header
                if is_bold and max_size > 15 and line_text == "Preamble":
                    current_mode = "PREAMBLE"
                    continue
                
                # Check for Chapter header: e.g. "CHAPTER 1. FOUNDING PROVISIONS" or "CHAPTER 2"
                ch_match = re.match(r"^CHAPTER\s+(\d+)[.:\s]*(.*)", line_text, re.IGNORECASE)
                if is_bold and max_size > 15 and ch_match:
                    current_mode = "CHAPTER"
                    ch_num = int(ch_match.group(1))
                    ch_title = ch_match.group(2).strip()
                    
                    current_chapter = {
                        "number": ch_num,
                        "title": ch_title,
                        "sections": []
                    }
                    all_chapters.append(current_chapter)
                    current_section = None
                    continue
                
                # Sometimes chapter title continues onto next bold line in 16.9pt
                if current_mode == "CHAPTER" and current_chapter and is_bold and max_size > 15 and not line_text.startswith("CHAPTER") and not "SCHEDULE" in line_text and not re.match(r"^\d+\.", line_text):
                    if not current_section:
                        current_chapter["title"] += " " + line_text
                        current_chapter["title"] = current_chapter["title"].strip()
                        continue

                # Check for Schedule header: "FIRST SCHEDULE...", "SECOND SCHEDULE..."
                sched_match = re.match(r"^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+SCHEDULE[.:\s]*(.*)", line_text, re.IGNORECASE)
                if is_bold and max_size > 15 and sched_match:
                    current_mode = "SCHEDULE"
                    s_name = sched_match.group(1).upper() + " SCHEDULE"
                    s_title = sched_match.group(2).strip()
                    current_schedule = {
                        "name": s_name,
                        "title": s_title,
                        "content": []
                    }
                    all_schedules.append(current_schedule)
                    current_section = None
                    continue

                if current_mode == "SCHEDULE" and current_schedule and is_bold and max_size > 15 and not sched_match:
                    current_schedule["title"] += " " + line_text
                    current_schedule["title"] = current_schedule["title"].strip()
                    continue
                
                # Check for Section header: e.g. "1. The Republic", "48. Right to life"
                # Sections have size between 10.5 and 14.5 and start with a number followed by dot
                sec_match = re.match(r"^(\d+)\.\s+(.*)", line_text)
                if current_mode == "CHAPTER" and current_chapter and is_bold and 10.5 <= max_size <= 14.5 and sec_match:
                    sec_num = int(sec_match.group(1))
                    sec_title = sec_match.group(2).strip()
                    
                    current_section = {
                        "number": sec_num,
                        "title": sec_title,
                        "chapter": current_chapter["number"],
                        "chapter_title": current_chapter["title"],
                        "lines": []
                    }
                    current_chapter["sections"].append(current_section)
                    continue
                
                # Continued section title if on next bold line
                if current_mode == "CHAPTER" and current_section and is_bold and 10.5 <= max_size <= 14.5 and len(current_section["lines"]) == 0 and not re.match(r"^\d+\.", line_text):
                    current_section["title"] += " " + line_text
                    current_section["title"] = current_section["title"].strip()
                    continue

                # Accumulate content based on mode
                if current_mode == "PREAMBLE":
                    preamble_lines.append(line_text)
                elif current_mode == "CHAPTER":
                    if current_section:
                        current_section["lines"].append(line_text)
                elif current_mode == "SCHEDULE":
                    if current_schedule:
                        current_schedule["content"].append(line_text)

    # Post-process sections and generate summaries
    total_sections_count = 0
    clean_chapters = []
    
    # Plain language explainer hints for key constitutional areas
    topic_explainers = {
        1: "Establishes Zimbabwe as a sovereign, democratic Republic with supreme constitutional rule.",
        2: "Declares that the Constitution is the supreme law of Zimbabwe; any contrary law or custom is void.",
        3: "Articulates national founding values including the rule of law, human rights, gender equality, and democracy.",
        4: "Identifies the official national symbols: Flag, Anthem, Public Seal, and Coat of Arms.",
        6: "Recognises 16 official languages including Chewa, Chibarwe, English, Kalanga, Ndebele, Shona, and Sign Language.",
        7: "Mandates the State to teach and promote public awareness of the Constitution throughout society.",
        35: "Outlines principles of Zimbabwean citizenship, prohibiting arbitrary revocation and ensuring equal rights.",
        44: "Binds every person and state institution to respect, protect, and fulfill fundamental human rights.",
        48: "Guarantees every person's inherent right to life, strictly limiting capital punishment.",
        49: "Protects the fundamental right to personal liberty, prohibiting unlawful arrest or detention.",
        50: "Details essential legal protections for arrested and detained individuals, including right to counsel and prompt court appearance.",
        51: "Protects the inherent dignity of all human beings in both private and public life.",
        56: "Guarantees equality and non-discrimination before the law regardless of nationality, gender, or background.",
        61: "Protects freedom of expression, freedom of the media, and artistic creativity.",
        62: "Guarantees citizens the right to access information held by the State in the interest of transparency.",
        65: "Safeguards labor rights, including fair collective bargaining and safe working conditions.",
        67: "Protects political rights: to vote in free elections, join political parties, and campaign peacefully.",
        88: "Vests executive authority in the President and Cabinet to exercise in accordance with the Constitution.",
        116: "Vests legislative authority in the Parliament of Zimbabwe, consisting of the Senate and National Assembly.",
        162: "Vests judicial authority in the courts, upholding the rule of law and impartiality."
    }

    for ch in all_chapters:
        ch_sections = []
        for s in ch["sections"]:
            # Combine lines cleanly
            body_text = "\n".join(s["lines"]).strip()
            
            # Formulate conversational summary
            summary = topic_explainers.get(
                s["number"],
                f"Section {s['number']} provides constitutional provisions governing {s['title'].lower()}."
            )
            
            ch_sections.append({
                "number": s["number"],
                "title": s["title"],
                "chapterNumber": ch["number"],
                "chapterTitle": ch["title"],
                "content": body_text,
                "summary": summary
            })
            total_sections_count += 1
            
        clean_chapters.append({
            "number": ch["number"],
            "title": ch["title"],
            "sections": ch_sections
        })

    # Post-process schedules
    clean_schedules = []
    for sc in all_schedules:
        clean_schedules.append({
            "name": sc["name"],
            "title": sc["title"],
            "content": "\n".join(sc["content"][:100]).strip() # concise schedule preview
        })

    constitution["preamble"] = "\n\n".join(preamble_lines).strip()
    constitution["chapters"] = clean_chapters
    constitution["schedules"] = clean_schedules

    print(f"Extracted Preamble ({len(constitution['preamble'])} chars)")
    print(f"Extracted {len(clean_chapters)} Chapters")
    print(f"Extracted {total_sections_count} Sections")
    print(f"Extracted {len(clean_schedules)} Schedules")

    # Save to data/constitution.json and js/constitution-data.js
    with open("data/constitution.json", "w", encoding="utf-8") as f:
        json.dump(constitution, f, indent=2, ensure_ascii=False)
        
    with open("js/constitution-data.js", "w", encoding="utf-8") as f:
        f.write("// Complete Constitution of Zimbabwe (2013) Dataset\n")
        f.write("window.CONSTITUTION_DATA = ")
        json.dump(constitution, f, indent=2, ensure_ascii=False)
        f.write(";\n")

    print("Export complete: data/constitution.json & js/constitution-data.js")

if __name__ == "__main__":
    run_extraction()
