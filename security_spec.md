# MarketSpace Firestore Security Specification

## 1. Data Invariants
- **Identity & Privilege Escalation**: A user can never elevate their own role to `ADMIN` or `SUPER_ADMIN`. Admin role must be verified by `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` or server-side claims.
- **Tenant Isolation**: A Seller (`sellerId`) can only create, update, or delete products and store records belonging to their own `sellerId`. They cannot touch another Seller's store or products.
- **Customer Isolation**: A customer can only read and create their own orders (`customerId == request.auth.uid`). Sellers can read orders that contain their vendor sub-orders or where they are the vendor.
- **Authoritative Pricing & Integrity**: Product prices, commissions, and order grand totals cannot be arbitrarily overwritten or set negatively.
- **Review Integrity**: A user can only create a review with `userId == request.auth.uid` and rating between 1 and 5. Once created, only the owner or an admin can manage it.
- **Immortal Keys**: Primary ownership fields (`uid`, `sellerId`, `customerId`, `createdAt`) are immutable after creation.

## 2. The Dirty Dozen Payloads
1. `MaliciousUserRoleEscalation`: Customer attempts to create/update `/users/{uid}` with `role: "SUPER_ADMIN"`. -> EXPECT: PERMISSION_DENIED.
2. `ImpersonatedUserWrite`: User A attempts to write to `/users/{userB_uid}`. -> EXPECT: PERMISSION_DENIED.
3. `CrossSellerProductUpdate`: Seller A attempts to modify price/title of `/products/{productB}` owned by Seller B. -> EXPECT: PERMISSION_DENIED.
4. `CrossSellerStoreTamper`: Seller A attempts to update `/stores/{storeB}` details or toggle `isVerified: true`. -> EXPECT: PERMISSION_DENIED.
5. `UnauthenticatedOrderRead`: Anonymous caller attempts to read all customer orders `/orders`. -> EXPECT: PERMISSION_DENIED.
6. `OrderOwnerSpoof`: User A creates an order with `customerId: "userB"`. -> EXPECT: PERMISSION_DENIED.
7. `CustomerSelfApproval`: Customer attempts to update `/sellerApplications/{appId}` with `status: "approved"`. -> EXPECT: PERMISSION_DENIED.
8. `FakeAdminInjection`: Non-admin attempts to write directly into `/admins/{uid}`. -> EXPECT: PERMISSION_DENIED.
9. `ReviewAuthorSpoof`: User A submits a review with `userId: "userB"`. -> EXPECT: PERMISSION_DENIED.
10. `ServiceBookingTamper`: Non-participant attempts to cancel or modify `/bookings/{bookingId}`. -> EXPECT: PERMISSION_DENIED.
11. `NotificationSnoop`: User A attempts to list notifications where `userId == "userB"`. -> EXPECT: PERMISSION_DENIED.
12. `OversizedResourcePoisoning`: Client attempts to send a 500KB payload into a title or name field. -> EXPECT: PERMISSION_DENIED.
