# Interactive-Kiosks-Application
A multimodal self-service kiosk platform for point-of-sale ordering, built primarily for food-service businesses and adaptable to retail and supermarket environments. Customers browse a digital menu, build an order in a virtual cart, optionally link a loyalty-program number to earn points, provide a tax ID (CPF, in the Brazilian context) for fiscal invoicing, apply discount coupons, choose from multiple payment methods, and receive their receipt digitally by email or SMS.
The platform follows a modular, tiered architecture so the level of hardware integration and customization can scale with each client's needs:

- **Basic tier** — a fully software-based ordering flow: digital menu, cart, loyalty lookup, tax-ID-on-invoice, payment selection, coupons, and digital receipt delivery.
- **Intermediate tier** — adds peripheral integrations such as thermal receipt printers and QR-code/barcode scanners, enabling in-store coupon redemption or supermarket-style self-checkout flows.
- **Advanced tier** — extends the platform with scale integration and RFID/chip-based item identification for weight-priced or tagged products.

Each deployment is configured with the exact combination of modules a given client requires, ranging from a lightweight, software-only kiosk to a fully hardware-integrated self-checkout terminal.
