# apps/accounts/migrations/0001_initial.py

import uuid

import apps.accounts.models
from django.db import migrations, models


def create_case_insensitive_collation(apps, schema_editor):
    # Non-deterministic, case-insensitive collation for `account.email`
    # (Document 05 Sec 3.1). Postgres-only; no-op on any other backend.
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "CREATE COLLATION IF NOT EXISTS case_insensitive "
        "(provider = icu, locale = 'und-u-ks-level2', deterministic = false);"
    )


def drop_case_insensitive_collation(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("DROP COLLATION IF EXISTS case_insensitive;")


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.RunPython(
            create_case_insensitive_collation,
            reverse_code=drop_case_insensitive_collation,
        ),
        migrations.CreateModel(
            name='Account',
            fields=[
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('email', models.TextField(db_collation='case_insensitive', unique=True)),
                ('phone', models.TextField(blank=True, null=True, unique=True)),
                ('password', models.CharField(blank=True, max_length=128, null=True)),
                ('full_name', models.CharField(max_length=255)),
                ('role', models.CharField(choices=[('visitor', 'Visitor'), ('cashier', 'Cashier'), ('museum_manager', 'Museum Manager'), ('platform_admin', 'Platform Admin')], default='visitor', max_length=20)),
                ('language_preference', models.CharField(choices=[('en', 'English'), ('am', 'Amharic')], default='en', max_length=2)),
                ('email_verified_at', models.DateTimeField(blank=True, null=True)),
                ('phone_verified_at', models.DateTimeField(blank=True, null=True)),
                ('phone_otp_hash', models.CharField(blank=True, max_length=128, null=True)),
                ('phone_otp_expires_at', models.DateTimeField(blank=True, null=True)),
                ('phone_otp_attempts', models.PositiveSmallIntegerField(default=0)),
                ('email_verification_token_hash', models.CharField(blank=True, max_length=128, null=True)),
                ('email_verification_expires_at', models.DateTimeField(blank=True, null=True)),
                ('password_reset_token_hash', models.CharField(blank=True, max_length=128, null=True)),
                ('password_reset_expires_at', models.DateTimeField(blank=True, null=True)),
                ('active', models.BooleanField(default=True)),
                ('token_version', models.PositiveIntegerField(default=0)),
            ],
            options={
                'db_table': 'account',
                'indexes': [models.Index(condition=models.Q(('active', True)), fields=['role'], name='account_active_role_idx')],
                'constraints': [models.CheckConstraint(condition=models.Q(('role', 'visitor'), ('password__isnull', False), _connector='OR'), name='account_staff_requires_password')],
            },
            managers=[
                ('objects', apps.accounts.models.AccountManager()),
            ],
        ),
    ]