# Seeds the four categories from current policy (Document 02 FR-CAT-001,
# Document 05 Sec 3.2). Data migrations are the standard, environment-
# independent way to ship required rows -- every environment (dev,
# staging, production) runs the same `migrate`, so this never depends on
# a separate fixture-loading step.

from django.db import migrations

# Document 07 TC-CAT-001a checks against exactly these five rows.
SEED_CATEGORIES = [
    {"name_en": "Student", "name_am": "ተማሪ", "price_etb": "50.00", "is_free": False},
    {
        "name_en": "Adult",
        "name_am": "ጎልማሳ",
        "price_etb": "100.00",
        "is_free": False,
    },
    {
        "name_en": "Foreign Resident",
        "name_am": "የውጭ ዜጋ, ነዋሪ",
        "price_etb": "300.00",
        "is_free": False,
    },
    {
        "name_en": "Non-Resident",
        "name_am": "የውጭ ዜጋ, ጎብኚ",
        "price_etb": "500.00",
        "is_free": False,
    },
]


def seed_categories(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    for category in SEED_CATEGORIES:
        Category.objects.get_or_create(name_en=category["name_en"], defaults=category)


def unseed_categories(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Category.objects.filter(name_en__in=[c["name_en"] for c in SEED_CATEGORIES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_categories, unseed_categories),
    ]
