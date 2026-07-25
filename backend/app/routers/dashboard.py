from fastapi import APIRouter, Depends

from app.database import get_cursor
from app.dependencies import get_current_admin

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats")
def dashboard_stats(admin: dict = Depends(get_current_admin)):
    """Single-row KPI summary — total/available/issued/returned books,
    students, late returns and fine collected/pending (vw_dashboard_stats)."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM vw_dashboard_stats")
        stats = cur.fetchone()
    return stats


@router.get("/issues-trend")
def issues_trend(days: int = 14, admin: dict = Depends(get_current_admin)):
    """Books issued per day for the last N days — powers the dashboard line chart."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DATE(issue_date) AS day, COUNT(*) AS issued_count
            FROM book_issues
            WHERE issue_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
            GROUP BY DATE(issue_date)
            ORDER BY day ASC
            """,
            (days,),
        )
        rows = cur.fetchall()
    return rows


@router.get("/category-distribution")
def category_distribution(admin: dict = Depends(get_current_admin)):
    """Book count per category — powers the dashboard donut chart."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT c.category_name, COUNT(b.book_id) AS book_count
            FROM categories c
            LEFT JOIN books b ON b.category_id = c.category_id
            GROUP BY c.category_id, c.category_name
            HAVING COUNT(b.book_id) > 0
            ORDER BY book_count DESC
            """
        )
        rows = cur.fetchall()
    return rows


@router.get("/recent-activity")
def recent_activity(limit: int = 8, admin: dict = Depends(get_current_admin)):
    """Latest issues + returns combined, newest first — dashboard activity feed."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT bi.issue_id, b.title, s.full_name AS student_name,
                   bi.issue_date, bi.return_date, bi.status
            FROM book_issues bi
            INNER JOIN books b ON b.book_id = bi.book_id
            INNER JOIN students s ON s.student_id = bi.student_id
            ORDER BY GREATEST(bi.issue_date, COALESCE(bi.return_date, bi.issue_date)) DESC, bi.issue_id DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    return rows
