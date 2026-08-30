"""
Seeds the two daily FR-PAY-005 jobs (apps/bookings/tasks.py) into
django_celery_beat's own tables.

Per docker-compose.yml, the `beat` service runs
`--scheduler django_celery_beat.schedulers:DatabaseScheduler`, which reads
its schedule from the CrontabSchedule/PeriodicTask tables below -- NOT
from a CELERY_BEAT_SCHEDULE dict in settings. Without this migration, Beat
has an empty schedule and neither job ever runs.

Staggered 15 minutes apart (01:00 / 01:15 Africa/Addis_Ababa) so the
no-response refund sweep never races the no-show notice sweep on the same
run, even though each task's own WHERE clause (see tasks.py docstrings)
would make a same-time race harmless anyway -- this is just defense in
depth. Idempotent and reversible: re-running is a no-op via
get_or_create, and reversing removes only the two rows this migration
created (get_or_create on the same set of fields).
"""

from django.db import migrations


NOTICE_TASK = "apps.bookings.tasks.check_pending_visit_date_passed"
REFUND_TASK = "apps.bookings.tasks.check_no_response_refund"
TIMEZONE = "Africa/Addis_Ababa"


def seed_schedule(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    notice_crontab, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="1",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone=TIMEZONE,
    )
    refund_crontab, _ = CrontabSchedule.objects.get_or_create(
        minute="15",
        hour="1",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone=TIMEZONE,
    )

    PeriodicTask.objects.get_or_create(
        task=NOTICE_TASK,
        defaults={
            "name": "FR-PAY-005 step 1: no-show notice sweep",
            "crontab": notice_crontab,
            "enabled": True,
        },
    )
    PeriodicTask.objects.get_or_create(
        task=REFUND_TASK,
        defaults={
            "name": "FR-PAY-005 step 2: no-response auto-refund sweep",
            "crontab": refund_crontab,
            "enabled": True,
        },
    )


def unseed_schedule(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(task__in=[NOTICE_TASK, REFUND_TASK]).delete()
    # Leave the CrontabSchedule rows -- django_celery_beat may reuse them
    # for other tasks; PeriodicTask deletion is the meaningful un-seed.


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0002_remove_booking_booking_unsettled_visited_idx_and_more"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_schedule, unseed_schedule),
    ]