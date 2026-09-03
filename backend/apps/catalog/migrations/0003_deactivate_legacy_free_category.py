from django.db import migrations


def deactivate_legacy_free_category(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Category.objects.filter(name_en="Exempt / Free", active=True).update(active=False)


def preserve_legacy_free_category(apps, schema_editor):
    # The legacy row may have been intentionally retired before rollback.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0002_seed_categories"),
    ]

    operations = [
        migrations.RunPython(
            deactivate_legacy_free_category,
            preserve_legacy_free_category,
        ),
    ]
