"""
Generates docs/er-diagram.svg / .png for the Library Management System.
Run: python3 generate_er_diagram.py
"""
import graphviz

g = graphviz.Digraph(
    "LMS_ER",
    format="svg",
    graph_attr={
        "rankdir": "LR",
        "bgcolor": "white",
        "fontname": "Helvetica",
        "splines": "spline",
        "nodesep": "0.6",
        "ranksep": "0.9",
    },
    node_attr={"shape": "plaintext", "fontname": "Helvetica"},
    edge_attr={"fontname": "Helvetica", "fontsize": "10", "color": "#64748B"},
)

INK = "#0F1B2D"
BRASS = "#C9971C"
HEADER_TEXT = "white"


def table(name, rows, header_color=INK):
    """rows: list of (label, tag) where tag in {'PK','FK','UK','PK/FK',''}"""
    tag_colors = {"PK": BRASS, "FK": "#3563E9", "UK": "#158F77", "PK/FK": "#8A660F", "": "#333333"}
    row_html = []
    for label, tag in rows:
        tag_cell = f'<FONT COLOR="{tag_colors[tag]}"><B>{tag}</B></FONT>' if tag else "&nbsp;"
        row_html.append(
            f'<TR><TD ALIGN="LEFT" PORT="{label.split()[0]}">{label}</TD>'
            f'<TD ALIGN="LEFT">{tag_cell}</TD></TR>'
        )
    body = "".join(row_html)
    html = f'''<
    <TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" COLOR="#E5E9F0">
      <TR><TD COLSPAN="2" BGCOLOR="{header_color}"><FONT COLOR="{HEADER_TEXT}"><B>{name}</B></FONT></TD></TR>
      {body}
    </TABLE>>'''
    g.node(name, label=html)


table("admins", [
    ("admin_id", "PK"), ("username", "UK"), ("password_hash", ""),
    ("full_name", ""), ("email", "UK"), ("role", ""), ("is_active", ""),
])

table("admin_sessions", [
    ("session_id", "PK"), ("admin_id", "FK"), ("token_hash", ""),
    ("expires_at", ""), ("is_active", ""),
])

table("categories", [("category_id", "PK"), ("category_name", "UK"), ("description", "")])
table("publishers", [("publisher_id", "PK"), ("publisher_name", "UK"), ("address", "")])
table("authors", [("author_id", "PK"), ("author_name", "UK"), ("nationality", "")])

table("books", [
    ("book_id", "PK"), ("isbn", "UK"), ("title", ""),
    ("category_id", "FK"), ("publisher_id", "FK"),
    ("total_copies", ""), ("available_copies", ""), ("price", ""), ("status", ""),
])

table("book_authors", [("book_id", "PK/FK"), ("author_id", "PK/FK")])

table("students", [
    ("student_id", "PK"), ("roll_number", "UK"), ("full_name", ""),
    ("email", "UK"), ("phone", "UK"), ("department", ""), ("status", ""),
])

table("book_issues", [
    ("issue_id", "PK"), ("book_id", "FK"), ("student_id", "FK"),
    ("issue_date", ""), ("due_date", ""), ("return_date", ""),
    ("fine_amount", ""), ("status", ""), ("issued_by", "FK"), ("returned_to", "FK"),
])

table("fine_payments", [
    ("payment_id", "PK"), ("issue_id", "FK"), ("amount_paid", ""),
    ("payment_date", ""), ("collected_by", "FK"),
])

table("audit_log", [("log_id", "PK"), ("table_name", ""), ("action", ""), ("record_id", ""), ("changed_at", "")], header_color="#3a3f4b")
table("settings", [("setting_key", "PK"), ("setting_value", ""), ("description", "")], header_color="#3a3f4b")

# Relationships
g.edge("admins", "admin_sessions", label="1 : N", dir="none")
g.edge("categories", "books", label="1 : N", dir="none")
g.edge("publishers", "books", label="1 : N", dir="none")
g.edge("books", "book_authors", label="1 : N", dir="none")
g.edge("authors", "book_authors", label="1 : N", dir="none")
g.edge("students", "book_issues", label="1 : N", dir="none")
g.edge("books", "book_issues", label="1 : N", dir="none")
g.edge("book_issues", "fine_payments", label="1 : N", dir="none")
g.edge("admins", "book_issues", label="1 : N  (issued_by)", dir="none", style="dashed")
g.edge("admins", "fine_payments", label="1 : N  (collected_by)", dir="none", style="dashed")

g.render("er-diagram", cleanup=True)
g.format = "png"
g.attr(dpi="150")
g.render("er-diagram", cleanup=True)
print("Rendered er-diagram.svg and er-diagram.png")
