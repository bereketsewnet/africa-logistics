# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Login page >> admin logs in and lands on /admin
- Location: tests/auth.spec.ts:50:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img "Africa Logistics" [ref=e7]
        - button "Pin sidebar" [ref=e8] [cursor=pointer]:
          - img [ref=e9]
      - generic [ref=e11]: Admin Panel
    - navigation [ref=e12]:
      - button "Overview" [ref=e13] [cursor=pointer]:
        - img [ref=e15]
        - generic [ref=e17]: Overview
      - button "All Users 2" [ref=e18] [cursor=pointer]:
        - img [ref=e20]
        - generic [ref=e25]: All Users
        - generic [ref=e26]: "2"
      - button "Shippers" [ref=e27] [cursor=pointer]:
        - img [ref=e29]
        - generic [ref=e33]: Shippers
      - button "Drivers 1" [ref=e34] [cursor=pointer]:
        - img [ref=e36]
        - generic [ref=e41]: Drivers
        - generic [ref=e42]: "1"
      - button "Verify Drivers" [ref=e43] [cursor=pointer]:
        - img [ref=e45]
        - generic [ref=e48]: Verify Drivers
      - button "Vehicles" [ref=e49] [cursor=pointer]:
        - img [ref=e51]
        - generic [ref=e55]: Vehicles
      - button "My Profile" [ref=e56] [cursor=pointer]:
        - img [ref=e58]
        - generic [ref=e61]: My Profile
    - generic [ref=e62]:
      - generic [ref=e63]:
        - img [ref=e65]
        - generic [ref=e67]:
          - paragraph [ref=e68]: Super Admin
          - paragraph [ref=e69]: Administrator
      - button "Sign out" [ref=e70] [cursor=pointer]:
        - img [ref=e71]
        - text: Sign out
  - generic [ref=e74]:
    - banner [ref=e75]:
      - button [ref=e76] [cursor=pointer]:
        - img [ref=e77]
      - paragraph [ref=e79]:
        - img [ref=e80]
        - text: Overview
      - button [ref=e82] [cursor=pointer]:
        - img [ref=e84]
    - main [ref=e86]:
      - generic [ref=e87]:
        - generic [ref=e88]:
          - heading "Overview" [level=2] [ref=e89]:
            - img [ref=e90]
            - text: Overview
          - generic [ref=e92]:
            - generic [ref=e93]:
              - generic [ref=e94]:
                - img [ref=e96]
                - generic [ref=e101]: Total
              - generic [ref=e102]: "2"
              - generic [ref=e103]: all users
            - generic [ref=e104]:
              - generic [ref=e105]:
                - img [ref=e107]
                - generic [ref=e110]: Active
              - generic [ref=e111]: "2"
              - generic [ref=e112]: accounts
            - generic [ref=e113]:
              - generic [ref=e114]:
                - img [ref=e116]
                - generic [ref=e120]: Shippers
              - generic [ref=e121]: "0"
            - generic [ref=e122]:
              - generic [ref=e123]:
                - img [ref=e125]
                - generic [ref=e130]: Drivers
              - generic [ref=e131]: "1"
            - generic [ref=e132]:
              - generic [ref=e133]:
                - img [ref=e135]
                - generic [ref=e137]: Admins
              - generic [ref=e138]: "1"
            - generic [ref=e139]:
              - generic [ref=e140]:
                - img [ref=e142]
                - generic [ref=e144]: Today
              - generic [ref=e145]: "2"
              - generic [ref=e146]: new today
        - generic [ref=e147]:
          - generic [ref=e148]:
            - heading "Recent Registrations" [level=3] [ref=e149]:
              - img [ref=e150]
              - text: Recent Registrations
            - button "View all →" [ref=e154] [cursor=pointer]
          - generic [ref=e155]:
            - generic [ref=e156]:
              - img [ref=e158]
              - generic [ref=e163]:
                - paragraph [ref=e164]: Bek Driver
                - paragraph [ref=e165]: "+251965500639"
              - generic [ref=e166]: Driver
            - generic [ref=e167]:
              - img [ref=e169]
              - generic [ref=e171]:
                - paragraph [ref=e172]: Super Admin
                - paragraph [ref=e173]: "+251911000001"
              - generic [ref=e174]: Admin
```