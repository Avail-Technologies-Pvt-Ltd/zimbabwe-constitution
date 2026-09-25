"""
Clean, canonical extractor for the Constitution of Zimbabwe (2013).
Extracts:
1. Preamble
2. All 18 Chapters (Sections 1 to 345)
3. Parts within chapters
4. Subsections and paragraphs
5. All 6 Schedules
Filters out all sidebar margin index annotations, running headers, and footers.
Exports:
- data/zimbabwe_constitution.json
- data/zimbabwe_constitution.md
- data/zimbabwe_constitution_sections.jsonl
- static/js/constitution-data.js
"""

import os
import re
import json
import pymupdf

def clean_span_text(t):
    return t.replace('\xa0', ' ').replace('\u2013', '-').replace('\u2014', '--')

def extract_clean_constitution(pdf_path="zim_constitution.pdf"):
    doc = pymupdf.open(pdf_path)
    
    preamble_lines = []
    chapters = []
    schedules = []
    
    current_mode = "START"
    current_chapter = None
    current_part = None
    current_section = None
    current_schedule = None
    
    # Human-curated plain language explainers for key constitutional clauses
    topic_explainers = {
        1: "Establishes Zimbabwe as a sovereign, democratic Republic with supreme constitutional rule.",
        2: "Declares that the Constitution is the supreme law of Zimbabwe; any contrary law or custom is void.",
        3: "Articulates national founding values including the rule of law, human rights, gender equality, and democracy.",
        4: "Identifies the official national symbols: Flag, Anthem, Public Seal, and Coat of Arms.",
        5: "Defines the tiers of government in Zimbabwe: national, provincial/metropolitan, and local authorities.",
        6: "Recognises 16 official languages including Chewa, Chibarwe, English, Kalanga, Ndebele, Shona, and Sign Language.",
        7: "Mandates the State to teach and promote public awareness of the Constitution throughout society.",
        8: "Sets out national objectives to guide the State, judiciary, and all agencies in policy and governance.",
        9: "Directs all state institutions to uphold transparency, public participation, and good governance.",
        10: "Mandates the promotion of national unity, peace, and social stability.",
        11: "Directs the State to promote fundamental human rights and freedoms.",
        12: "Establishes foreign policy principles based on peace, regional integration, and sovereign equality.",
        13: "Directs national development to promote balanced regional development and economic independence.",
        14: "Guarantees state empowerment programs with special priority to marginalized communities.",
        15: "Directs the State to promote food security and sustainable agricultural production.",
        16: "Preserves and promotes the diverse cultural heritage, customs, and traditions of Zimbabwe.",
        17: "Mandates gender balance and equal representation of women in all governmental bodies.",
        18: "Directs state authorities to provide fair assistance to the fair distribution of resources.",
        19: "Protects children's rights to shelter, education, nutrition, and safety from child labor.",
        20: "Promotes youth empowerment, civic engagement, education, and vocational employment.",
        21: "Protects the elderly, guaranteeing social welfare, healthcare, and dignity.",
        22: "Mandates reasonable accommodation, accessibility, and respect for persons with disabilities.",
        23: "Recognizes the contributions of liberation war veterans and ensures their welfare.",
        24: "Directs the State to facilitate employment creation and dignified working conditions.",
        25: "Protects the family institution and marriage stability.",
        26: "Guarantees rights of spouses in marriage and custody rights upon dissolution.",
        27: "Mandates free and compulsory basic education and promotes higher and tertiary learning.",
        28: "Directs the State to ensure access to adequate shelter and housing.",
        29: "Mandates basic healthcare services for all citizens and emergency treatment.",
        30: "Directs the provision of social security to citizens in need.",
        31: "Safeguards domestic legal systems and traditional authority.",
        32: "Requires legal institutions to ensure accessible, timely, and impartial justice.",
        33: "Directs the State to promote and preserve the national work ethic.",
        34: "Requires ratification and incorporation of international conventions and human rights treaties.",
        35: "Outlines principles of Zimbabwean citizenship, prohibiting arbitrary revocation and ensuring equal rights.",
        36: "Defines citizenship by birth for persons born in Zimbabwe or born abroad to Zimbabwean citizens.",
        37: "Defines citizenship by descent for persons born outside Zimbabwe to citizens.",
        38: "Defines rules for citizenship by registration through marriage or lawful residency.",
        39: "Specifies strict constitutional grounds and legal safeguards for any revocation of citizenship.",
        40: "Guarantees that marriage or dissolution of marriage does not affect citizenship status.",
        41: "Establishes the Citizenship and Immigration Board to oversee citizenship applications.",
        42: "Regulates powers of Parliament regarding registration, dual citizenship, and passports.",
        43: "Guarantees the continuation and restoration of previous citizenship rights.",
        44: "Binds every person and state institution to respect, protect, and fulfill fundamental human rights.",
        45: "Defines the application of the Declaration of Rights to natural and juristic persons.",
        46: "Provides authoritative rules for courts and bodies when interpreting fundamental human rights.",
        47: "Clarifies that Chapter 4 does not preclude or limit any other rights recognized by law.",
        48: "Guarantees every person's inherent right to life, strictly limiting capital punishment.",
        49: "Protects the fundamental right to personal liberty, prohibiting unlawful arrest or detention.",
        50: "Details essential legal protections for arrested and detained individuals, including right to counsel and prompt court appearance.",
        51: "Protects the inherent dignity of all human beings in both private and public life.",
        52: "Protects bodily integrity and physical freedom from medical or scientific abuse.",
        53: "Strictly prohibits physical or psychological torture, and cruel, inhuman, or degrading treatment.",
        54: "Protects all persons from slavery, servitude, and forced or compulsory labor.",
        55: "Strictly bans all forms of slavery and human trafficking.",
        56: "Guarantees equality and non-discrimination before the law regardless of nationality, gender, or background.",
        57: "Protects the right to personal privacy, homes, communications, and confidential personal data.",
        58: "Protects freedom of assembly, association, and the right to join trade unions and organizations.",
        59: "Guarantees the right to demonstrate and present petitions peacefully and unarmed.",
        60: "Protects freedom of conscience, thought, religion, and belief.",
        61: "Protects freedom of expression, freedom of the media, and artistic creativity.",
        62: "Guarantees citizens the right to access information held by the State in the interest of transparency.",
        63: "Protects language and cultural rights, allowing participation in the cultural life of choice.",
        64: "Protects the freedom to choose and practice any trade, occupation, or profession.",
        65: "Safeguards labor rights, including fair collective bargaining and safe working conditions.",
        66: "Protects freedom of movement and residence within Zimbabwe and the right to leave and enter.",
        67: "Protects political rights: to vote in free elections, join political parties, and campaign peacefully.",
        68: "Guarantees the right to lawful, prompt, efficient, and reasonable administrative justice.",
        69: "Guarantees the right to a fair, public trial before an independent and impartial court.",
        70: "Sets out rights of accused persons: presumption of innocence, right to counsel, and fair trial standards.",
        71: "Protects property rights, regulating compulsory acquisition and guaranteeing compensation.",
        72: "Regulates agricultural land acquisition for public resettlement and agrarian reform.",
        73: "Guarantees the right to a clean, safe environment protected for present and future generations.",
        74: "Protects citizens from arbitrary eviction from their homes without a court order.",
        75: "Guarantees the right to a basic state-funded education and further education.",
        76: "Guarantees the right to basic healthcare services and emergency medical treatment.",
        77: "Protects the right to safe, clean, and potable water and sufficient food.",
        78: "Regulates marriage rights, establishing marriage age of eighteen and voluntary consent.",
        80: "Guarantees equal rights and opportunities for women in political, economic, and social spheres.",
        81: "Protects children's rights: best interests of child, birth registration, parental care, and shelter.",
        82: "Guarantees rights of the elderly to social protection, healthcare, and family care.",
        83: "Protects rights of persons with disabilities to self-reliance, accessibility, and equal inclusion.",
        84: "Protects rights of veterans of the liberation struggle to state assistance and welfare.",
        85: "Provides mechanisms for any person to approach the Constitutional Court to enforce rights.",
        86: "Sets out strict tests and standards for any legitimate limitation of fundamental rights.",
        87: "Regulates limitations on fundamental rights during a declared state of public emergency.",
        88: "Vests executive authority in the President and Cabinet to exercise in accordance with the Constitution.",
        89: "Vests executive power in the President to uphold and defend the Constitution.",
        90: "Outlines constitutional duties of the President as Head of State and Government.",
        91: "Sets out presidential qualifications: citizenship by birth or descent, registered voter, age 40+.",
        92: "Regulates presidential elections by universal adult suffrage and secret ballot.",
        93: "Governs challenge to presidential elections before the Constitutional Court within seven days.",
        94: "Governs swearing in and assumption of office by the President and Vice-Presidents.",
        95: "Sets presidential term of office at five years, limiting tenure to maximum of two terms.",
        96: "Governs resignation of the President by written notice to the Speaker of Parliament.",
        97: "Governs removal from office of President or Vice-President on grounds of gross misconduct or incapacity.",
        98: "Regulates presidential immunity from civil and criminal proceedings while in office.",
        99: "Establishes not more than two Vice-Presidents to assist the President.",
        100: "Regulates acting President in the absence or illness of the President.",
        101: "Regulates presidential succession in the event of vacancy in the office of President.",
        102: "Requires Ministers and Deputy Ministers to be appointed from Members of Parliament.",
        104: "Regulates appointment and dismissal of Cabinet Ministers and Deputy Ministers.",
        105: "Defines Cabinet composition: President, Vice-Presidents, and Cabinet Ministers.",
        106: "Governs conduct of Ministers and Deputy Ministers, barring conflicts of interest.",
        107: "Requires Ministers to account to Parliament for the administration of their ministries.",
        108: "Governs vacation of office by Ministers and Deputy Ministers.",
        110: "Defines executive functions of the President and Cabinet.",
        111: "Barres declaration of war without prior authorization by Parliament.",
        112: "Governs proclamation of states of public emergency.",
        113: "Governs presidential prerogative of mercy and pardons.",
        114: "Establishes the Attorney-General as principal legal adviser to the Government.",
        115: "Outlines removal of the Attorney-General from office.",
        116: "Vests legislative authority of Zimbabwe in Parliament.",
        117: "Defines legislative authority: power to make laws for peace, order, and good governance.",
        118: "Establishes the Senate, composed of 80 Senators.",
        119: "Establishes role of Parliament in protecting the Constitution and holding Government accountable.",
        120: "Regulates composition of the Senate and proportional representation.",
        121: "Governs qualification and disqualification for election as a Senator.",
        122: "Governs election of the President and Deputy President of the Senate.",
        124: "Establishes the National Assembly, consisting of 270 Members.",
        125: "Sets out qualifications and disqualifications for election to the National Assembly.",
        126: "Governs election of the Speaker and Deputy Speaker of the National Assembly.",
        128: "Governs oaths of Members of Parliament before taking their seats.",
        129: "Defines circumstances under which a seat of a Member of Parliament becomes vacant.",
        130: "Regulates introduction of Bills in Parliament.",
        131: "Governs passing of Bills by Parliament and presidential assent.",
        132: "Requires Acts of Parliament to be published in the Gazette within seven days.",
        133: "Establishes the Parliamentary Legal Committee to examine Bills and statutory instruments.",
        134: "Regulates statutory instruments and delegated subsidiary legislation.",
        135: "Governs clerk of Parliament and parliamentary staff.",
        138: "Regulates privilege and immunity of speech in Parliament.",
        139: "Governs Standing Rules and Orders of Parliament.",
        140: "Governs presidential addresses to Parliament.",
        141: "Mandates public access to and participation in parliamentary proceedings and committees.",
        142: "Governs quorum of the Senate and National Assembly.",
        143: "Governs duration and dissolution of Parliament at five-year intervals.",
        144: "Governs general elections following dissolution of Parliament.",
        148: "Governs privileges, immunities and powers of Parliament.",
        151: "Establishes the Committee on Standing Rules and Orders.",
        152: "Establishes the Parliamentary Legal Committee.",
        155: "Establishes principles of the electoral system: free, fair, regular elections and equality of votes.",
        156: "Directs conduct of elections: timely announcement, peaceful environment, and transparent voting.",
        157: "Governs the Electoral Law.",
        158: "Regulates timing of general elections and by-elections.",
        159: "Governs by-elections to fill casual vacancies.",
        160: "Governs delimitation of electoral boundaries into 210 constituencies.",
        161: "Regulates delimitation of electoral boundaries.",
        162: "Vests judicial authority in the courts of Zimbabwe.",
        163: "Defines the judiciary: Chief Justice, Deputy Chief Justice, and judges.",
        164: "Guarantees the independence of the courts from political or external interference.",
        165: "Sets out principles guiding the judiciary: justice to all, fairness, and accountability.",
        166: "Establishes the Constitutional Court as the highest court in all constitutional matters.",
        167: "Defines jurisdiction of the Constitutional Court.",
        168: "Establishes the Supreme Court as the final court of appeal in non-constitutional matters.",
        169: "Defines jurisdiction of the Supreme Court.",
        170: "Establishes the High Court of Zimbabwe.",
        171: "Defines jurisdiction of the High Court.",
        172: "Establishes the Labour Court to adjudicate employment disputes.",
        173: "Establishes the Administrative Court.",
        174: "Provides for other courts: magistrates courts, customary law courts, and small claims courts.",
        175: "Governs powers of courts in constitutional matters and referrals.",
        176: "Vests inherent powers in the Constitutional Court, Supreme Court and High Court.",
        177: "Sets out qualifications of judges of the Constitutional Court.",
        178: "Sets out qualifications of judges of the Supreme Court.",
        179: "Sets out qualifications of judges of the High Court, Labour Court and Administrative Court.",
        180: "Governs appointment of judges by the President from Judicial Service Commission nominees.",
        181: "Governs acting judicial appointments.",
        185: "Governs swearing in of judges.",
        186: "Sets tenure of office of judges and retirement age.",
        187: "Governs removal of judges from office for gross incompetence or misconduct via tribunal.",
        188: "Guarantees conditions of service and remuneration of judges cannot be reduced.",
        189: "Establishes the Judicial Service Commission.",
        190: "Defines functions of the Judicial Service Commission.",
        194: "Sets out basic values and principles governing public administration.",
        199: "Establishes the Civil Service to implement governmental policies.",
        202: "Establishes the Civil Service Commission.",
        207: "Establishes the Security Services: Defence Forces, Police Service, Intelligence Services, and Prisons.",
        208: "Mandates political neutrality of security services, prohibiting partisan conduct.",
        211: "Establishes the Defence Forces to defend the sovereignty and territorial integrity of Zimbabwe.",
        212: "Defines the command of the Defence Forces.",
        219: "Establishes the Police Service to preserve peace, protect life, and investigate crime.",
        224: "Establishes Intelligence Services.",
        227: "Establishes the Prisons and Correctional Service.",
        232: "Establishes independent commissions supporting democracy: ZEC, ZHRC, ZMC, NPRC, and ZACC.",
        233: "Defines objectives of independent commissions supporting democracy.",
        238: "Establishes the Zimbabwe Electoral Commission (ZEC).",
        242: "Establishes the Zimbabwe Human Rights Commission (ZHRC).",
        248: "Establishes the Zimbabwe Media Commission (ZMC).",
        251: "Establishes the National Peace and Reconciliation Commission (NPRC).",
        254: "Establishes the Zimbabwe Anti-Corruption Commission (ZACC).",
        258: "Establishes the National Prosecuting Authority responsible for instituting criminal prosecutions.",
        259: "Establishes the office and powers of the Prosecutor-General.",
        264: "Establishes the devolution of governmental powers to provincial and local tiers of government.",
        267: "Establishes provinces and provincial boundaries.",
        268: "Establishes provincial councils.",
        274: "Establishes urban local authorities (city and town councils).",
        275: "Establishes rural local authorities (rural district councils).",
        280: "Recognizes the institution, status, and role of traditional leadership.",
        281: "Defines principles governing traditional leaders: impartiality and political neutrality.",
        285: "Establishes the National Council of Chiefs.",
        288: "Defines agricultural land and state ownership provisions.",
        296: "Establishes the Zimbabwe Land Commission.",
        298: "Sets out principles of public financial management: transparency, accountability, and fiscal discipline.",
        302: "Establishes the Consolidated Revenue Fund.",
        305: "Governs preparation and presentation of the national annual budget.",
        308: "Directs duties of custodians of public funds and property.",
        309: "Establishes the Auditor-General.",
        318: "Establishes the Reserve Bank of Zimbabwe as the central bank.",
        324: "Directs that all constitutional obligations must be performed diligently and without delay.",
        326: "Defines customary international law as part of the law of Zimbabwe.",
        327: "Governs negotiation, signing, and parliamentary ratification of international treaties.",
        328: "Governs constitutional amendment procedures requiring two-thirds majority in Parliament.",
        329: "Governs commencement and effective dates of the Constitution.",
        332: "Sets out definitions and rules of interpretation for constitutional terms."
    }

    print(f"Reading {pdf_path} (126 pages)...")
    
    # Process pages 6 to 120 (indices 5 to 119)
    for p_idx in range(5, 120):
        page = doc[p_idx]
        blocks = page.get_text("dict")["blocks"]
        
        # Sort blocks vertically, discard left-margin annotations (< 170) and headers/footers
        blocks = [b for b in blocks if "bbox" in b and b["bbox"][0] >= 170 and b["bbox"][1] > 30 and b["bbox"][3] < 750]
        blocks.sort(key=lambda b: b["bbox"][1])
        
        for b in blocks:
            for l in b.get("lines", []):
                spans = l.get("spans", [])
                if not spans: continue
                # Sort spans by x0 coordinate to ensure correct reading order
                spans = sorted(spans, key=lambda s: s["bbox"][0])
                
                line_str = " ".join(clean_span_text(s["text"]) for s in spans).strip()
                if not line_str: continue
                
                # Check for header/footer leaks
                if line_str.startswith("constituteproject.org") or \
                   line_str.startswith("PDF generated:") or \
                   line_str == "Zimbabwe 2013" or \
                   re.match(r"^Page \d+$", line_str):
                    continue
                
                max_size = max(s["size"] for s in spans)
                is_bold = any("Bold" in s["font"] for s in spans)
                
                # 1. Preamble detection
                if is_bold and max_size > 15 and line_str == "Preamble":
                    current_mode = "PREAMBLE"
                    continue
                
                # 2. Chapter header detection
                ch_match = re.match(r"^CHAPTER\s+(\d+)[.:\s]*(.*)", line_str, re.I)
                if is_bold and max_size > 15 and ch_match:
                    current_mode = "CHAPTER"
                    ch_num = int(ch_match.group(1))
                    ch_title = ch_match.group(2).strip()
                    current_chapter = {
                        "number": ch_num,
                        "title": ch_title,
                        "parts": [],
                        "sections": []
                    }
                    chapters.append(current_chapter)
                    current_section = None
                    current_part = None
                    continue
                
                # Chapter title continuation onto next bold line
                if current_mode == "CHAPTER" and current_chapter and is_bold and max_size > 15 and \
                   not line_str.startswith("CHAPTER") and not "SCHEDULE" in line_str and \
                   not re.match(r"^\d+\.", line_str) and not current_section:
                    current_chapter["title"] += " " + line_str
                    current_chapter["title"] = current_chapter["title"].strip()
                    continue
                
                # 3. Schedule header detection
                sched_match = re.match(r"^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+SCHEDULE[.:\s]*(.*)", line_str, re.I)
                if is_bold and max_size > 15 and sched_match:
                    current_mode = "SCHEDULE"
                    s_name = sched_match.group(1).upper() + " SCHEDULE"
                    s_title = sched_match.group(2).strip()
                    current_schedule = {
                        "name": s_name,
                        "title": s_title,
                        "lines": []
                    }
                    schedules.append(current_schedule)
                    current_section = None
                    continue
                
                # Schedule title continuation
                if current_mode == "SCHEDULE" and current_schedule and is_bold and max_size > 15 and \
                   not sched_match and len(current_schedule["lines"]) == 0:
                    current_schedule["title"] += " " + line_str
                    current_schedule["title"] = current_schedule["title"].strip()
                    continue
                
                # 4. Part header detection (within chapters)
                part_match = re.match(r"^PART\s+(\d+)[.:\s]*(.*)", line_str, re.I)
                if is_bold and 10.0 <= max_size <= 15.5 and part_match:
                    p_num = int(part_match.group(1))
                    p_title = part_match.group(2).strip()
                    current_part = {"number": p_num, "title": p_title}
                    if current_chapter and not any(p["number"] == p_num for p in current_chapter["parts"]):
                        current_chapter["parts"].append(current_part)
                    continue
                
                # Part title continuation
                if current_mode == "CHAPTER" and current_part and is_bold and 10.0 <= max_size <= 15.5 and \
                   not re.match(r"^\d+\.", line_str) and not current_section and not part_match:
                    current_part["title"] += " " + line_str
                    current_part["title"] = current_part["title"].strip()
                    continue
                
                # 5. Section header detection: "123. Title"
                sec_match = re.match(r"^(\d+)\.\s*(.*)", line_str)
                if current_mode == "CHAPTER" and current_chapter and is_bold and 10.0 <= max_size <= 15.5 and sec_match:
                    sec_num = int(sec_match.group(1))
                    sec_title = sec_match.group(2).strip()
                    current_section = {
                        "number": sec_num,
                        "title": sec_title,
                        "chapter_number": current_chapter["number"],
                        "chapter_title": current_chapter["title"],
                        "part_number": current_part["number"] if current_part else None,
                        "part_title": current_part["title"] if current_part else None,
                        "raw_lines": []
                    }
                    current_chapter["sections"].append(current_section)
                    continue
                
                # Section title continuation
                if current_mode == "CHAPTER" and current_section and is_bold and 10.0 <= max_size <= 15.5 and \
                   len(current_section["raw_lines"]) == 0 and not re.match(r"^\d+\.", line_str):
                    current_section["title"] += " " + line_str
                    current_section["title"] = current_section["title"].strip()
                    continue
                
                # 6. Body text accumulation
                if current_mode == "PREAMBLE":
                    preamble_lines.append(line_str)
                elif current_mode == "CHAPTER" and current_section:
                    current_section["raw_lines"].append(line_str)
                elif current_mode == "SCHEDULE" and current_schedule:
                    current_schedule["lines"].append(line_str)

    # Post-process sections: group lines into paragraphs and structure subsections
    total_sections = 0
    all_sections_flat = []
    
    for ch in chapters:
        for sec in ch["sections"]:
            total_sections += 1
            raw_lines = sec.pop("raw_lines", [])
            
            cleaned_lines = []
            for line in raw_lines:
                # Clean page break repeated subsection bullets e.g. "d. 1. text" -> "d. text"
                cleaned = re.sub(r'([a-z]\.)\s+\d+\.\s+([a-z])', r'\1 \2', line)
                # Remove standalone stray subsection numbers that appear on line continuations
                if cleaned.strip() in ['1.', '2.', '3.', '4.', '5.']:
                    continue
                # Split any lettered bullet that got attached after semicolon
                subparts = re.split(r'(?<=;)\s+(?=[a-z]\.\s+)', cleaned)
                cleaned_lines.extend(subparts)

            # Format clean paragraph text
            # Detect subsection bullets: "1.", "2.", "a.", "b.", "i.", "ii."
            formatted_paragraphs = []
            current_paragraph = []
            
            for line in cleaned_lines:
                # If line starts a new numbered or lettered bullet
                is_bullet = bool(re.match(r"^(\d+\.|\([0-9]+\)|[a-z]\.|\([a-z]\)|[ivxlcdm]+\.|\([ivxlcdm]+\))(\s+|$)", line, re.I))
                
                # Check if current_paragraph is only an isolated bullet symbol (e.g. ['d.'])
                is_only_bullet = (len(current_paragraph) == 1 and bool(re.match(r"^(\d+\.|\([0-9]+\)|[a-z]\.|\([a-z]\)|[ivxlcdm]+\.|\([ivxlcdm]+\))$", current_paragraph[0].strip(), re.I)))
                
                if is_bullet and current_paragraph and not is_only_bullet:
                    formatted_paragraphs.append(" ".join(current_paragraph))
                    current_paragraph = [line]
                else:
                    current_paragraph.append(line)
            
            if current_paragraph:
                formatted_paragraphs.append(" ".join(current_paragraph))
            
            content_text = "\n\n".join(formatted_paragraphs).strip()
            sec["content"] = content_text
            
            # Conversational summary
            sec_num = sec["number"]
            summary = topic_explainers.get(
                sec_num,
                f"Section {sec_num} sets out the constitutional requirements and legal framework for {sec['title'].lower()}."
            )
            sec["summary"] = summary
            
            # Structured subsections
            structured_subsections = []
            for p in formatted_paragraphs:
                sub_m = re.match(r"^(\d+)\.\s*(.*)", p)
                letter_m = re.match(r"^([a-z])\.\s*(.*)", p)
                roman_m = re.match(r"^([ivxlcdm]+)\.\s*(.*)", p)
                if sub_m:
                    structured_subsections.append({
                        "identifier": f"({sub_m.group(1)})",
                        "type": "subsection",
                        "text": sub_m.group(2).strip()
                    })
                elif letter_m:
                    structured_subsections.append({
                        "identifier": f"({letter_m.group(1)})",
                        "type": "paragraph",
                        "text": letter_m.group(2).strip()
                    })
                elif roman_m:
                    structured_subsections.append({
                        "identifier": f"({roman_m.group(1)})",
                        "type": "subparagraph",
                        "text": roman_m.group(2).strip()
                    })
                else:
                    structured_subsections.append({
                        "identifier": "",
                        "type": "text",
                        "text": p.strip()
                    })
            sec["subsections"] = structured_subsections
            
            all_sections_flat.append(sec)

    # Post-process schedules
    clean_schedules = []
    for sc in schedules:
        clean_schedules.append({
            "name": sc["name"],
            "title": sc["title"],
            "content": "\n\n".join(sc["lines"]).strip()
        })

    # Preamble text
    preamble_clean = "\n\n".join(preamble_lines).strip()

    constitution_dict = {
        "title": "Constitution of Zimbabwe",
        "subtitle": "Constitution of Zimbabwe Amendment (No. 20) Act, 2013",
        "promulgation_date": "2013-05-22",
        "preamble": preamble_clean,
        "total_chapters": len(chapters),
        "total_sections": total_sections,
        "total_schedules": len(clean_schedules),
        "chapters": chapters,
        "schedules": clean_schedules
    }
    
    print(f"Extracted {len(chapters)} Chapters, {total_sections} Sections, {len(clean_schedules)} Schedules.")
    return constitution_dict, all_sections_flat

def generate_markdown(constitution_dict):
    """Generate an authoritative, publication-grade Markdown document."""
    md = []
    md.append(f"# {constitution_dict['title']}")
    md.append(f"**{constitution_dict['subtitle']}**\n")
    md.append(f"*Adopted: 16 March 2013 • Signed into Law: 22 May 2013*\n")
    md.append("---\n")
    
    md.append("## Table of Contents\n")
    md.append("- [Preamble](#preamble)")
    for ch in constitution_dict["chapters"]:
        ch_slug = f"chapter-{ch['number']}-{ch['title'].lower().replace(' ', '-').replace(',', '')}"
        md.append(f"- [Chapter {ch['number']}: {ch['title']}](#{ch_slug})")
    for sc in constitution_dict["schedules"]:
        sc_slug = f"{sc['name'].lower().replace(' ', '-')}"
        md.append(f"- [{sc['name']}: {sc['title']}](#{sc_slug})")
    md.append("\n---\n")

    md.append("## Preamble\n")
    for p in constitution_dict["preamble"].split("\n\n"):
        md.append(f"> {p}\n>")
    md.append("\n---\n")

    for ch in constitution_dict["chapters"]:
        ch_slug = f"chapter-{ch['number']}-{ch['title'].lower().replace(' ', '-').replace(',', '')}"
        md.append(f"## Chapter {ch['number']}: {ch['title']}\n")
        
        last_part = None
        for sec in ch["sections"]:
            if sec.get("part_number") and sec.get("part_number") != last_part:
                last_part = sec["part_number"]
                md.append(f"### Part {sec['part_number']}: {sec['part_title']}\n")
            
            md.append(f"#### Section {sec['number']}. {sec['title']}\n")
            if sec.get("summary"):
                md.append(f"*Plain Language Context: {sec['summary']}*\n")
            
            for para in sec["content"].split("\n\n"):
                if para.strip():
                    md.append(f"{para.strip()}\n")
            md.append("")
        md.append("---\n")

    for sc in constitution_dict["schedules"]:
        md.append(f"## {sc['name']}: {sc['title']}\n")
        for para in sc["content"].split("\n\n"):
            if para.strip():
                md.append(f"{para.strip()}\n")
        md.append("\n---\n")

    return "\n".join(md)

def run():
    const_data, all_sections = extract_clean_constitution()
    
    # 1. Output Canonical JSON
    os.makedirs("data", exist_ok=True)
    json_path = "data/zimbabwe_constitution.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(const_data, f, indent=2, ensure_ascii=False)
    print(f"Saved: {json_path} ({os.path.getsize(json_path):,} bytes)")

    # Also update data/constitution.json for backward compatibility
    with open("data/constitution.json", "w", encoding="utf-8") as f:
        json.dump(const_data, f, indent=2, ensure_ascii=False)
    print("Updated: data/constitution.json")

    # 2. Output Markdown File
    md_content = generate_markdown(const_data)
    md_path = "data/zimbabwe_constitution.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    print(f"Saved: {md_path} ({os.path.getsize(md_path):,} bytes)")

    # 3. Output JSON Lines (JSONL) - 1 section per line
    jsonl_path = "data/zimbabwe_constitution_sections.jsonl"
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for sec in all_sections:
            f.write(json.dumps(sec, ensure_ascii=False) + "\n")
    print(f"Saved: {jsonl_path} ({os.path.getsize(jsonl_path):,} bytes)")

    # 4. Output static JS for offline web app
    os.makedirs("static/js", exist_ok=True)
    js_path = "static/js/constitution-data.js"
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("/**\n * Official Constitution of Zimbabwe (2013) - Canonical Clean Dataset\n")
        f.write(" * Includes Preamble, Chapters 1-18 (345 Sections), and Schedules 1-6\n */\n")
        f.write("window.CONSTITUTION_DATA = ")
        json.dump(const_data, f, indent=2, ensure_ascii=False)
        f.write(";\n")
    print(f"Saved: {js_path} ({os.path.getsize(js_path):,} bytes)")

if __name__ == "__main__":
    run()
