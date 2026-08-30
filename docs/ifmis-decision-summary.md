# How Museum Payments Will Reconcile with Finance/IFMIS — Decision Summary

## The problem we ran into

Finance uses a government system called IFMIS to track money owed to them.
We saw a real example of one of their receipts: it's created **by a
specific staff member, by name, for one transaction at a time** — not
something Finance produces later from a slip of paper. And it turns out
**every visitor** (not just school groups) is supposed to get one of these
when they pay.

That created a real question for us: our website takes payments online,
and nobody physically hands cash to any staff member for those — so who is
the "cashier" that IFMIS should hold responsible for that money?

## Options we considered

- **Have the museum's website call IFMIS directly and automatically.**
  Ruled out — IFMIS is a closed government system, not something outside
  software is allowed to plug into. This was already a known limitation
  going in.

- **Have Finance staff enter everything into IFMIS themselves, from a
  batch report we hand them.** This was our original plan. Problem: it
  doesn't give the visitor anything at the time of their visit, and it
  doesn't match how the real process actually works (per-visitor, on the
  spot).

- **Have one dedicated staff member permanently responsible for all online
  payments in IFMIS.** Considered and rejected — cashiers work shifts, and
  making one person personally liable for every visitor's payment,
  regardless of who was even working that day, isn't fair or realistic.

- **Let multiple cashiers share one login/account in IFMIS.** Considered
  and rejected — IFMIS ties responsibility to a named individual. Sharing
  one login removes any real accountability for who entered what.

## The decision we landed on

**Whoever is working the entrance that day handles it — same as she
already does for regular walk-in ticket sales.** When she checks a visitor
in, she enters that one transaction into IFMIS herself, under her own
name, and hands over the real voucher. This isn't new work invented for
the website — it's the same thing she already does all day for paper
tickets, just extended to online bookings too.

Because she's personally putting her name on that money in IFMIS, the
website will track, for each cashier individually, how much she's
currently responsible for — not one shared total for the whole museum.
That way, when she settles up with Finance, it's her own number, and
nothing gets mixed up between different staff members' shifts.

**Settling up itself will also be a real transfer, not just paperwork.**
The online payments all sit together in the payment processor's account
until someone moves them into the university's actual bank account. We
confirmed the payment processor supports doing that transfer directly —
so instead of a manual bank errand, a cashier will be able to send her
own owed amount straight to the university's account with one click (with
a simple "are you sure" confirmation, nothing more complicated). She'll
then get proof of that transfer and hand it to Finance, alongside the
IFMIS vouchers she's already collected — the IFMIS vouchers themselves
are only ever given to visitors, one per visitor, and together they're
what shows Finance how many visitors she handled and how much she owes.

## Net result

The website will support the exact same process Finance already trusts —
one named person, personally responsible, entering things as they happen —
just extended to cover online payments too, without needing anyone to sit
permanently in front of IFMIS or share logins.
