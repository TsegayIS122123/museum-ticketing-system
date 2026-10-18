# Brand the single `django.contrib.sites` Site row (SITE_ID=1) as this
# product instead of Django's placeholder "example.com". allauth reads it
# when composing account emails: the subject line gets a "[<site.name>] "
# prefix (DefaultAccountAdapter.format_email_subject) and the body addresses
# the visitor by the site's name and domain
# (account/email/*_message.txt use `current_site.name`/`current_site.domain`).
#
# `update_or_create` rather than `get_or_create`: the default "example.com"
# row is created by django.contrib.sites' `post_migrate` handler, so on a
# fresh database it may not exist yet when this runs -- and on an existing
# development database it already exists with the placeholder values. Either
# way this migration must end with the row carrying our values.
#
# Ships the same way every other required row does (see catalog's
# `0002_seed_categories`): a data migration, so dev/staging/production all
# get it from the same `migrate`. The domain is the local development host;
# a real deployment overrides it from the admin/settings once it has a real
# public hostname.

from django.db import migrations

SITE_DOMAIN = "localhost:8000"
SITE_NAME = "ZNHM Ticketing"
DJANGO_DEFAULT_DOMAIN = "example.com"


def set_site_branding(apps, schema_editor):
    Site = apps.get_model("sites", "Site")
    Site.objects.update_or_create(
        pk=1, defaults={"domain": SITE_DOMAIN, "name": SITE_NAME}
    )


def unset_site_branding(apps, schema_editor):
    Site = apps.get_model("sites", "Site")
    Site.objects.update_or_create(
        pk=1,
        defaults={"domain": DJANGO_DEFAULT_DOMAIN, "name": DJANGO_DEFAULT_DOMAIN},
    )


class Migration(migrations.Migration):

    dependencies = [
        ("sites", "0002_alter_domain_unique"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(set_site_branding, unset_site_branding),
    ]
