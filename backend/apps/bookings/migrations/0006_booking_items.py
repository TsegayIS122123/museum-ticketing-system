"""
Splits `Booking`'s single category/quantity/price fields out into a new
`BookingItem` line-items table, so one booking can cover more than one
visitor category (e.g. one Adult ticket plus two Student tickets bought
together in a single checkout) instead of forcing a separate booking per
category.

Three phases, in order, so the data migration below still sees the old
columns before they're dropped:
  1. Create `booking_item`.
  2. Backfill: one `BookingItem` per existing `Booking`, copying that
     booking's own category/name/price/quantity/total across verbatim --
     every booking that exists today keeps exactly the single line item
     it always implicitly had.
  3. Remove the now-redundant `category`/`category_name_en`/
     `category_name_am`/`unit_price_etb` columns from `booking` itself.
     `category_corrected_at`/`category_corrected_by_user_id` (added in
     0005) are untouched -- they stay on `Booking` as a booking-level
     "was this ever corrected at the gate" marker; see
     `BookingItem`'s own docstring.
"""

import uuid

import django.db.models.deletion
from django.db import migrations, models


def _backfill_booking_items(apps, schema_editor):
    Booking = apps.get_model("bookings", "Booking")
    BookingItem = apps.get_model("bookings", "BookingItem")

    items = [
        BookingItem(
            id=uuid.uuid4(),
            booking_id=booking.pk,
            category_id=booking.category_id,
            category_name_en=booking.category_name_en,
            category_name_am=booking.category_name_am,
            unit_price_etb=booking.unit_price_etb,
            quantity=booking.booked_quantity,
            subtotal_etb=booking.total_amount_etb,
        )
        for booking in Booking.objects.all()
    ]
    BookingItem.objects.bulk_create(items)


def _reverse_backfill_booking_items(apps, schema_editor):
    # Reversing just drops the line items -- the RemoveField operations
    # below are reversed separately (AddField, backed by the loud
    # non-nullable defaults below), which is the direction this migration
    # is realistically ever un-applied in (a failed deploy, not a live
    # rollback after new multi-category bookings exist).
    BookingItem = apps.get_model("bookings", "BookingItem")
    BookingItem.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_deactivate_legacy_free_category"),
        ("bookings", "0005_booking_category_corrected_at_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="BookingItem",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("category_name_en", models.TextField()),
                ("category_name_am", models.TextField()),
                ("unit_price_etb", models.DecimalField(decimal_places=2, max_digits=12)),
                ("quantity", models.PositiveIntegerField()),
                ("subtotal_etb", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "booking",
                    models.ForeignKey(
                        db_column="booking_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="bookings.booking",
                    ),
                ),
                (
                    "category",
                    models.ForeignKey(
                        db_column="category_id",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="booking_items",
                        to="catalog.category",
                    ),
                ),
            ],
            options={
                "db_table": "booking_item",
                "ordering": ["created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="bookingitem",
            index=models.Index(fields=["booking"], name="booking_item_booking_idx"),
        ),
        migrations.AddConstraint(
            model_name="bookingitem",
            constraint=models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="booking_item_quantity_at_least_one",
            ),
        ),
        migrations.AddConstraint(
            model_name="bookingitem",
            constraint=models.UniqueConstraint(
                fields=["booking", "category"],
                name="booking_item_unique_category_per_booking",
            ),
        ),
        migrations.RunPython(_backfill_booking_items, _reverse_backfill_booking_items),
        migrations.RemoveField(model_name="booking", name="category"),
        migrations.RemoveField(model_name="booking", name="category_name_en"),
        migrations.RemoveField(model_name="booking", name="category_name_am"),
        migrations.RemoveField(model_name="booking", name="unit_price_etb"),
    ]
