/**
 * Language Context (src/context/LanguageContext.tsx)
 *
 * Provides app-wide language state: English ('en') or Amharic ('am').
 * Selection is persisted in localStorage so it survives page refresh.
 *
 * Usage:
 *   const { lang, setLang, t } = useLanguage()
 *   t('hello')  →  renders from the active translation dict
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'

// ─── Supported languages ─────────────────────────────────────────────────────
export type Lang = 'en' | 'am'

// ─── Translation dictionary ───────────────────────────────────────────────────
export const translations: Record<Lang, Record<string, string>> = {
  en: {
    // shared / nav
    language_toggle_label: 'EN',

    // login / register
    login_title: 'Sign In',
    login_subtitle: 'Welcome back to Africa Logistics',

    // dock nav labels
    nav_account:   'My Account',
    nav_vehicle:   'My Vehicle',
    nav_shipments: 'My Shipments',
    nav_jobs:      'My Jobs',
    nav_report:    'Report',
    nav_wallet:    'Wallet',
    nav_history:   'History',
    nav_help:      'Help & Support',

    // account sub-tabs
    tab_profile:     'Profile',
    tab_security:    'Security',
    tab_contact:     'Contact',
    tab_preferences: 'Prefs',
    tab_docs:        'Docs',

    // driver status badges
    driver_status_available:  'Available',
    driver_status_on_job:     'On Job',
    driver_status_offline:    'Offline',
    driver_status_suspended:  'Suspended',

    // account header
    needs_car:          'Needs Car',
    verified:           'verified',
    pending_verify:     'pending',
    remove_photo:       'Remove photo',

    // rating card
    my_rating:          'My Rating',
    rating_no_rating:   'No rating yet — complete deliveries to earn your score.',
    loading:            'Loading…',

    // verification progress
    verification_progress:    'Verification Progress',
    verification_upload_start:'Upload your verification documents to get started.',
    go_to_documents:          'Go to Documents →',

    // profile tab
    profile_information: 'Profile Information',
    user_id_label:       'User ID',
    phone_label:         'Phone',
    email_label:         'Email',
    not_linked:          'not linked',
    role_label:          'Role',
    status_label:        'Status',
    status_active:       'Active',
    status_suspended:    'Suspended',
    display_name:        'Display Name',
    name_saved:          'Name saved!',
    first_name:          'First name',
    last_name:           'Last name',
    save_name:           'Save Name',
    saving:              'Saving…',

    // security tab
    security_title:         'Security',
    password_label:         'Password',
    password_sub:           'Update your login password',
    btn_cancel:             'Cancel',
    btn_change:             'Change',
    current_password:       'Current password',
    new_password:           'New password (min 6 chars)',
    confirm_new_password:   'Confirm new password',
    update_password:        'Update Password',
    password_updated:       'Password updated!',
    danger_zone:            'Danger Zone',
    danger_desc:            'Permanently delete your account and all associated data.',
    delete_my_account:      'Delete My Account',

    // contact tab
    contact_title:          'Contact Details',
    email_address_label:    'Email Address',
    link_email_sub:         'Link an email for recovery & notifications',
    btn_link:               'Link',
    check_inbox:            'Check your inbox and click the link.',
    email_field_label:      'Email address',
    send_verification_link: 'Send Verification Link',
    sending:                'Sending…',

    // delete account modal
    delete_account_title:   'Delete Account',
    delete_confirm_desc:    'This will permanently erase your account. Type DELETE to confirm.',
    type_delete:            'Type DELETE',
    delete_forever:         'Delete Forever',
    deleting:               'Deleting…',

    // my vehicle
    my_vehicle_title:       'My Vehicle',
    btn_refresh:            'Refresh',
    btn_submit_vehicle:     '+ Submit Vehicle',
    vehicle_desc:           'Own a vehicle? Submit it for admin approval. Once approved, it will be assigned to your driver profile.',
    no_vehicles_submitted:  'No vehicles submitted yet.',
    click_submit_vehicle:   'Click Submit Vehicle above to get started.',
    libre_view:             'View Libre ↗',
    under_review:           'Under review by admin',
    vehicle_approved:       'Approved — vehicle assigned to your profile',
    vehicle_rejected:       'Rejected — you may submit a new vehicle',
    submit_your_vehicle:    'Submit Your Vehicle',
    plate_number:           'Plate Number *',
    vehicle_type_label:     'Vehicle Type',
    select_vehicle_type:    '— Select vehicle type —',
    max_capacity:           'Max Capacity (kg) *',
    description_optional:   'Description (optional)',
    vehicle_photo_optional: 'Add vehicle photo (optional)',
    vehicle_photo_selected: 'Vehicle photo selected ✓',
    libre_doc_optional:     'Upload libre document (optional)',
    libre_doc_selected:     'Libre document selected ✓',
    submit_for_review:      'Submit for Review',
    submitting:             'Submitting…',

    // jobs page
    my_jobs_title:          'My Jobs',
    btn_ping_location:      'Ping My Location',
    pinging:                'Pinging…',
    auto_on:                'Auto: ON',
    auto_off:               'Auto: OFF',
    mark_delivered:         'Mark Delivered',
    clear:                  'Clear',
    select_all:             'Select All',
    deselect_all:           'Deselect All',
    loading_jobs:           'Loading jobs…',
    no_active_jobs:         'No active jobs right now.',
    no_completed_jobs:      'No completed jobs yet.',
    selected_item:          'Selected',
    select_item:            'Select',
    cross_border:           'Cross-Border',

    // status labels
    status_pending:         'Pending',
    status_assigned:        'Assigned',
    status_en_route:        'En Route',
    status_at_pickup:       'At Pickup',
    status_in_transit:      'In Transit',
    status_at_border:       'At Border',
    status_in_customs:      'In Customs',
    status_customs_cleared: 'Customs Cleared',
    status_delivered:       'Delivered',
    status_cancelled:       'Cancelled',
    mark_as:                'Mark as',

    // OTP modal
    otp_modal_title_pickup:   'Verify Pickup OTP',
    otp_modal_title_delivery: 'Verify Delivery OTP',
    otp_instruction:          'Enter the 6-digit OTP provided by the shipper.',
    otp_placeholder:          '6-Digit OTP',
    btn_confirm_otp:          'Confirm OTP',
    btn_verifying:            'Verifying…',

    // job detail modal
    job_details_tab:        'Job Details',
    admin_chat_tab:         'Admin Chat',
    docs_tab:               'Docs',
    cargo_label:            'Cargo',
    vehicle_label:          'Vehicle',
    weight_label:           'Weight',
    pickup_label:           'Pickup',
    delivery_label:         'Delivery',
    note_label:             'Note',
    shipper_label:          'Shipper',
    btn_decline:            'Decline',
    btn_accept_job:         'Accept Job',
    verify_pickup_otp:      'Verify Pickup OTP → In Transit',
    arrived_at_border:      '🌍 Arrived at Border Crossing',
    verify_delivery_otp:    'Verify Delivery OTP → Delivered',
    border_waiting:         '🛂 Waiting at border. Upload checkpoint photo in the Docs tab.',
    customs_review:         '📋 Shipment is under customs review.',
    customs_cleared_msg:    '✅ Customs cleared! Mark as In Transit to resume delivery.',

    // docs tab
    border_info:            'Border Info',
    border_ref:             'Border Ref',
    customs_ref:            'Customs Ref',
    hs_code:                'HS Code',
    shipper_tin:            'Shipper TIN',
    upload_document:        'Upload Document',
    notes_optional:         'Notes (optional)',
    btn_upload:             'Upload',
    uploaded_documents:     'Uploaded Documents',
    no_documents:           'No documents uploaded yet.',
    view_document:          'View document ↗',
    review_note:            'Review note:',
    reason_rejection:       'Reason for rejection:',
    no_reason:              'No reason provided.',

    // chat tab
    chat_with_admin:        'This chat is with Admin / Support only.',
    no_messages:            'No messages yet. Send a message to Admin.',
    message_admin_ph:       'Message Admin…',
    role_admin:             'Admin',
    role_staff:             'Staff',
    role_you:               'You',

    // GPS ping
    geo_not_supported:      'Geolocation not supported on this device/browser.',
    geo_denied:             'Location permission denied. Please allow location to share live tracking.',
    geo_failed:             'Could not get current location.',
    location_updated:       'Location updated ✓',
    ping_failed:            'Ping failed. Please try again.',
    allow_location_prompt:  'Please allow location when your browser asks.',
    allow_location_perm:    'Please allow location permission to enable live tracking.',

    // sign out
    sign_out: 'Sign Out',

    // help & support page
    help_title:         'Help & Support',
    help_subtitle:      'Fast, friendly help — whenever you need it',
    help_contact_us:    'Contact Us',
    help_follow_us:     'Follow Us',
    help_support_soon:  'Support details coming soon.',
    help_ai_title:      'AI Assistant',
    help_ai_sub:        'Ask anything — instant intelligent answers, 24/7',
    help_ask_ai:        'Ask AI Assistant',

    // wallet tabs
    wallet_tab:           'Wallet',
    history_tab:          'History',
    invoices_tab:         'Invoices',
    add_funds_tab:        'Add Funds',
    payouts_tab:          'Payouts',
    admin_payouts_title:  'Admin Payouts',
    no_payout_records:    'No payout records yet.',
    wallet_credit:        'Wallet Credit',
    bank_transfer_label:  'Bank Transfer',
    commission_label:     'Commission:',
    etb_deducted:         'ETB deducted',
    order_label:          'Order:',
    view_receipt:         'View Receipt',

    // preferences tab
    pref_display_theme:     'Display Theme',
    pref_theme_light:       'Light',
    pref_theme_dark:        'Dark',
    pref_theme_system:      'System',
    pref_notifications:     'Notifications',
    pref_notif_sub:         'SMS is reserved for critical alerts only.',
    notif_sms_label:        'SMS Alerts',
    notif_sms_sub:          'Critical updates only — order status, OTPs',
    notif_email_label:      'Email Notifications',
    notif_email_sub:        'Order summaries, receipts, account alerts',
    notif_browser_label:    'Browser Notifications',
    notif_browser_sub:      'Real-time web push alerts while browsing',
    notif_telegram_label:   'Telegram Alerts',
    notif_telegram_sub:     'Real-time alerts via Telegram bot',
    notif_orders_label:     'Order Updates',
    notif_orders_sub:       'Status changes on your logistics orders',
    notif_promo_label:      'Promotions',
    notif_promo_sub:        'News, offers and platform announcements',

    // driver documents tab
    goto_offline:           'Go Offline',
    goto_online:            'Go Online',
    driver_available_sub:   '— available for orders',
    driver_offline_sub:     '— not receiving orders',
    driver_on_job_sub:      '— delivery in progress',
    driver_suspended_sub:   '— contact admin',
    verif_docs_title:       'Verification Documents',
    account_verified_msg:   'Your account is fully verified!',
    doc_national_id:        'National ID',
    doc_license:            "Driver's License",
    doc_libre:              'Libre (Vehicle Ownership)',
    uploading:              'Uploading…',
    replace_file:           'Replace',
    upload_file_label:      'Upload file',
    doc_accepted_formats:   'Accepted: JPG, PNG, WEBP, PDF · Max 8 MB',

    // phone change
    enter_new_phone_desc:  'Enter your new number. An OTP will be sent to verify it.',
    send_otp_to_new:       'Send OTP to New Number',
    sending_otp:           'Sending OTP…',
    phone_updated:         'Phone number updated!',
    otp_sent_to:           'OTP sent to',
    enter_it_below:        'Enter it below.',
    six_digit_otp_label:   '6-digit OTP',
    back:                  'Back',
    verify_and_update:     'Verify & Update',
    verifying_label:       'Verifying…',

    // driver report
    rpt_driver_general:    'Driver General Report',
    rpt_period:            'Report Period',
    rpt_generated:         'Generated:',
    rpt_verified:          'Verified',
    rpt_pending_verif:     'Pending Verification',
    rpt_no_vehicle:        'No Active Vehicle',
    rpt_approved:          'Approved',
    rpt_pending_approval:  'Pending Approval',
    rpt_from:              'From',
    rpt_to:                'To',
    rpt_apply:             'Apply',
    rpt_loading:           'Loading driver report…',
    rpt_error:             'Failed to load your driver report. Please try again.',
    kpi_total_jobs:        'Total Jobs',
    kpi_completed_sub:     'completed',
    kpi_active_jobs:       'Active Jobs',
    kpi_currently_moving:  'currently moving',
    kpi_period_earnings:   'Period Earnings',
    kpi_lifetime:          'lifetime',
    kpi_distance:          'Distance',
    kpi_km_average:        'km average',
    kpi_avg_rating:        'Average Rating',
    kpi_reviews_sub:       'reviews in range',
    kpi_cross_border:      'Cross-Border',
    kpi_avg_delivery:      'h avg delivery',
    chart_daily_jobs:      'Daily Jobs, Completions & Earnings',
    chart_status_breakdown:'Job Status Breakdown',
    chart_driver_snapshot: 'Driver Snapshot',
    chart_rating_dist:     'Rating Distribution',
    chart_recent_jobs:     'Recent Jobs',
    chart_feedback:        'Recent Shipper Feedback',
    chart_doc_review:      'Document Review History',
    snap_phone:            'Phone',
    snap_email:            'Email',
    snap_on_time_rate:     'On-Time Rate',
    snap_streak:           'Streak',
    snap_days:             'days',
    snap_last_trip:        'Last Trip',
    snap_documents:        'Documents',
    snap_vehicle:          'Vehicle',
    snap_no_vehicle:       'No active vehicle assigned yet.',
    tbl_ref:               'Ref',
    tbl_col_status:        'Status',
    tbl_pickup:            'Pickup',
    tbl_delivery:          'Delivery',
    tbl_distance:          'Distance',
    tbl_earnings:          'Earnings',
    tbl_created:           'Created',
    tbl_no_jobs:           'No jobs found in this period.',
    no_comment:            'No written comment.',
    no_feedback:           'No rating feedback yet.',
    no_review_note:        'No review note provided.',
    no_doc_history:        'No document review history available yet.',
    rpt_footer_self:       'Driver self-report',

    // wallet dashboard
    wlt_available_balance:    'Available Balance',
    wlt_locked_label:         'Locked',
    wlt_active_label:         'Active',
    wlt_earned:               'Earned',
    wlt_spent:                'Spent',
    wlt_pending_wd:           'Pending',
    wlt_request_withdrawal:   'Request Withdrawal',
    wlt_cancel_withdrawal:    'Cancel Withdrawal',
    wlt_wallet_locked:        'Wallet Locked',
    wlt_locked_default:       'Your wallet has been suspended. Please contact support.',
    wlt_withdrawal_requests:  'Withdrawal Requests',
    wlt_loading_requests:     'Loading requests…',
    wlt_no_withdrawals:       'No withdrawal requests yet.',
    wlt_submit_request_above: 'Submit a request above and it will appear here.',
    wlt_recent_transactions:  'Recent Transactions',
    wlt_no_transactions:      'No transactions yet.',
    wlt_withdrawal_req_title: 'Withdrawal Request',
    wlt_amount_label:         'Amount to Withdraw (ETB)',
    wlt_available_label:      'Available:',
    wlt_pct_of_balance:       '% of balance',
    wlt_bank_name:            'Bank Name',
    wlt_account_number:       'Account Number',
    wlt_account_holder:       'Account Holder Name',
    wlt_note_optional:        'Note / Message (optional)',
    wlt_attach_receipt:       'Attach receipt / document (optional, max 5 MB)',
    wlt_remove:               'Remove',
    wlt_submitting:           'Submitting…',
    wlt_submit_request_btn:   'Submit Withdrawal Request',
    wlt_request_submitted:    'Request Submitted!',
    wlt_request_submitted_sub:"You'll be notified once reviewed by admin.",
    wlt_approved_label:       'Approved:',
    wlt_platform_fee:         'Platform fee',
    wlt_your_note:            'Your note:',
    wlt_your_proof:           'Your proof document',
    wlt_view_pdf:             'View PDF',
    wlt_admin_note:           'Admin note:',
    wlt_admin_confirmation:   'Admin confirmation',
    wlt_no_wallet:            'No wallet data available.',

    // transaction history
    txhist_title:         'Transaction History',
    txhist_search_ph:     'Search transactions...',
    txhist_filter_all:    'All Transactions',
    txhist_filter_credits:'Credits',
    txhist_filter_debits: 'Debits',
    txhist_filter_bonuses:'Bonuses',
    txhist_filter_tips:   'Tips',
    txhist_filter_refunds:'Refunds',
    txhist_no_found:      'No transactions found',
    txhist_receipt_btn:   'Receipt',
    txhist_previous:      'Previous',
    txhist_next:          'Next',
    txhist_page:          'Page',
    tx_credit:            'Credit',
    tx_debit:             'Debit',
    tx_commission:        'Commission',
    tx_tip:               'Tip',
    tx_refund:            'Refund',
    tx_bonus:             'Bonus',
    tx_adjustment:        'Adjustment',
  },

  am: {
    // shared / nav
    language_toggle_label: 'አማ',

    // login / register
    login_title:    'ግባ',
    login_subtitle: 'ወደ አፍሪካ ሎጂስቲክስ እንኳን ደህና መጡ',

    // dock nav labels
    nav_account:   'የእኔ መለያ',
    nav_vehicle:   'የእኔ ተሽከርካሪ',
    nav_shipments: 'የእኔ ጭነቶች',
    nav_jobs:      'የእኔ ስራዎች',
    nav_report:    'ሪፖርት',
    nav_wallet:    'ዋሌት',
    nav_history:   'ታሪክ',
    nav_help:      'እርዳታ',

    // account sub-tabs
    tab_profile:     'መገለጫ',
    tab_security:    'ደህንነት',
    tab_contact:     'አድራሻ',
    tab_preferences: 'ምርጫ',
    tab_docs:        'ሰነዶች',

    // driver status badges
    driver_status_available:  'ዝግጁ',
    driver_status_on_job:     'ስራ ላይ',
    driver_status_offline:    'ከስርዓት ውጭ',
    driver_status_suspended:  'ታግዷል',

    // account header
    needs_car:          'መኪና ፈልጓል',
    verified:           'ተረጋግጧል',
    pending_verify:     'በቅድሚያ ይጠብቃል',
    remove_photo:       'ፎቶ አስወግድ',

    // rating card
    my_rating:          'የእኔ ደረጃ',
    rating_no_rating:   'ምንም ደረጃ የለም — ለውጤት ጭነቶችን ያድርሱ።',
    loading:            'በመጫን ላይ…',

    // verification progress
    verification_progress:    'የማረጋገጫ እድገት',
    verification_upload_start:'ለመጀመር ማረጋገጫ ሰነዶችዎን ስቀሉ።',
    go_to_documents:          'ወደ ሰነዶች ሂድ →',

    // profile tab
    profile_information: 'የፕሮፋይል መረጃ',
    user_id_label:       'የተጠቃሚ መለያ',
    phone_label:         'ስልክ',
    email_label:         'ኢሜይል',
    not_linked:          'አልተገናኘም',
    role_label:          'ሚና',
    status_label:        'ሁኔታ',
    status_active:       'ንቁ',
    status_suspended:    'ታግዷል',
    display_name:        'የሚታይ ስም',
    name_saved:          'ስም ተቀምጧል!',
    first_name:          'ስም',
    last_name:           'የአባት ስም',
    save_name:           'ስም አስቀምጥ',
    saving:              'በማስቀመጥ ላይ…',

    // security tab
    security_title:         'ደህንነት',
    password_label:         'ምስጥቃ',
    password_sub:           'የመግቢያ ምስጥቃዎን ያዘምኑ',
    btn_cancel:             'ሰርዝ',
    btn_change:             'ቀይር',
    current_password:       'የአሁን ምስጥቃ',
    new_password:           'አዲስ ምስጥቃ (ቢያንስ 6 ፊደሎች)',
    confirm_new_password:   'አዲስ ምስጥቃ አረጋግጥ',
    update_password:        'ምስጥቃ አዘምን',
    password_updated:       'ምስጥቃ ዘምኗል!',
    danger_zone:            'አደገኛ ቦታ',
    danger_desc:            'መለያዎን እና ሁሉንም ተያያዥ ውሂብ ሙሉ ለሙሉ ይሰረዛል።',
    delete_my_account:      'መለያዬን ሰርዝ',

    // contact tab
    contact_title:          'የአድራሻ ዝርዝሮች',
    email_address_label:    'ኢሜይል አድራሻ',
    link_email_sub:         'ለማገገሚያ እና ማሳወቂያዎች ኢሜይል ያስሩ',
    btn_link:               'አስር',
    check_inbox:            'ሳጥንዎን ያረጋግጡ እና ሊንኩን ይጫኑ።',
    email_field_label:      'ኢሜይል አድራሻ',
    send_verification_link: 'የማረጋገጫ ሊንክ ላክ',
    sending:                'በመላክ ላይ…',

    // delete account modal
    delete_account_title:   'መለያ ሰርዝ',
    delete_confirm_desc:    'ይህ መለያዎን ሙሉ ለሙሉ ያጠፋል። ለማረጋገጥ DELETE ይተይቡ።',
    type_delete:            'DELETE ይተይቡ',
    delete_forever:         'ለዘላለም ሰርዝ',
    deleting:               'በመሰረዝ ላይ…',

    // my vehicle
    my_vehicle_title:       'የእኔ ተሽከርካሪ',
    btn_refresh:            'አድስ',
    btn_submit_vehicle:     '+ ተሽከርካሪ ጥቀስ',
    vehicle_desc:           'ተሽከርካሪ አለዎት? ለአስተዳዳሪ ፍቃድ ያቅርቡ። ሲፀድቅ ለሾፌር መገለጫዎ ይመደባል።',
    no_vehicles_submitted:  'ምንም ተሽከርካሪ አልቀረበም።',
    click_submit_vehicle:   'ለመጀመር ከላይ ያለውን ተሽከርካሪ ጥቀስ ይጫኑ።',
    libre_view:             'ሊብሬ ይመልከቱ ↗',
    under_review:           'በአስተዳዳሪ ክለሳ ስር',
    vehicle_approved:       'ጸድቋል — ተሽከርካሪ ለመገለጫዎ ተሰጥቷል',
    vehicle_rejected:       'ውድቅ — አዲስ ተሽከርካሪ ማቅረብ ይችላሉ',
    submit_your_vehicle:    'ተሽከርካሪዎን ያቅርቡ',
    plate_number:           'ሰሌዳ ቁጥር *',
    vehicle_type_label:     'የተሽከርካሪ አይነት',
    select_vehicle_type:    '— የተሽከርካሪ አይነት ምረጥ —',
    max_capacity:           'ከፍተኛ አቅም (ኪግ) *',
    description_optional:   'መግለጫ (አማራጭ)',
    vehicle_photo_optional: 'የተሽከርካሪ ፎቶ አስቀምጥ (አማራጭ)',
    vehicle_photo_selected: 'የተሽከርካሪ ፎቶ ተምርጧል ✓',
    libre_doc_optional:     'ሊብሬ ሰነድ ስቀል (አማራጭ)',
    libre_doc_selected:     'ሊብሬ ሰነድ ተምርጧል ✓',
    submit_for_review:      'ለክለሳ ያቅርቡ',
    submitting:             'በማቅረብ ላይ…',

    // jobs page
    my_jobs_title:          'የእኔ ስራዎች',
    btn_ping_location:      'ቦታዬን ላክ',
    pinging:                'በምልክት ላይ…',
    auto_on:                'ራስ-ሠር: ON',
    auto_off:               'ራስ-ሠር: OFF',
    mark_delivered:         'እንደደረሰ ምልክት አድርግ',
    clear:                  'አጽዳ',
    select_all:             'ሁሉንም ምረጥ',
    deselect_all:           'ሁሉንም ሰርዝ',
    loading_jobs:           'ስራዎችን በመጫን ላይ…',
    no_active_jobs:         'አሁን ምንም ንቁ ስራ የለም።',
    no_completed_jobs:      'ምንም ያለቀ ስራ የለም።',
    selected_item:          'ተምርጧል',
    select_item:            'ምረጥ',
    cross_border:           'ድንበር አቋራጭ',

    // status labels
    status_pending:         'በመጠባበቅ',
    status_assigned:        'ተሰጥቷል',
    status_en_route:        'እየጓዘ',
    status_at_pickup:       'ፒክአፕ ላይ',
    status_in_transit:      'ተጓጉዟል',
    status_at_border:       'ድንበር ላይ',
    status_in_customs:      'ጉምሩክ ላይ',
    status_customs_cleared: 'ጉምሩክ ጸድቋል',
    status_delivered:       'ደርሷል',
    status_cancelled:       'ተሰርዟል',
    mark_as:                'እንደ አድርግ',

    // OTP modal
    otp_modal_title_pickup:   'ፒክአፕ OTP አረጋግጥ',
    otp_modal_title_delivery: 'ማስፈቃጃ OTP አረጋግጥ',
    otp_instruction:          'ላኪው የሰጠዎትን 6-አሃዝ OTP ያስገቡ።',
    otp_placeholder:          '6-አሃዝ OTP',
    btn_confirm_otp:          'OTP አረጋግጥ',
    btn_verifying:            'በማረጋገጥ ላይ…',

    // job detail modal
    job_details_tab:        'የስራ ዝርዝሮች',
    admin_chat_tab:         'ከአስተዳዳሪ ጋር ውይይት',
    docs_tab:               'ሰነዶች',
    cargo_label:            'ጭነት',
    vehicle_label:          'ተሽከርካሪ',
    weight_label:           'ክብደት',
    pickup_label:           'ፒክአፕ',
    delivery_label:         'ማድረሻ',
    note_label:             'ማስታወሻ',
    shipper_label:          'ላኪ',
    btn_decline:            'ውድቅ',
    btn_accept_job:         'ስራ ተቀበል',
    verify_pickup_otp:      'ፒክአፕ OTP አረጋግጥ → ተጓጉዟል',
    arrived_at_border:      '🌍 ድንበር ማቋረጫ ደርሷል',
    verify_delivery_otp:    'ማስፈቃጃ OTP አረጋግጥ → ደርሷል',
    border_waiting:         '🛂 በድንበር ላይ እየጠበቀ ነው። ሰነዶች ትሩ ላይ ፎቶ ስቀሉ።',
    customs_review:         '📋 ጭነቱ በጉምሩክ ክለሳ ላይ ነው።',
    customs_cleared_msg:    '✅ ጉምሩክ ጸድቋል! ተደርሷል ለማለት ወደ ጉዞ ምልክት አድርጉ።',

    // docs tab
    border_info:            'የድንበር መረጃ',
    border_ref:             'ድንበር ማጣቀሻ',
    customs_ref:            'የጉምሩክ ማጣቀሻ',
    hs_code:                'HS ኮድ',
    shipper_tin:            'ላኪ TIN',
    upload_document:        'ሰነድ ስቀል',
    notes_optional:         'ማስታወሻ (አማራጭ)',
    btn_upload:             'ስቀል',
    uploaded_documents:     'የተሰቀሉ ሰነዶች',
    no_documents:           'ምንም ሰነዶች አልተሰቀሉም።',
    view_document:          'ሰነድ ይመልከቱ ↗',
    review_note:            'ማስታወሻ:',
    reason_rejection:       'ለውድቅ ምክንያት:',
    no_reason:              'ምንም ምክንያት አልቀረበም።',

    // chat tab
    chat_with_admin:        'ይህ ቢሮ ግንኙነት ብቻ ነው።',
    no_messages:            'ምንም መልዕክት የለም። ለአስተዳዳሪ ይላኩ።',
    message_admin_ph:       'ለአስተዳዳሪ ይናገሩ…',
    role_admin:             'አስተዳዳሪ',
    role_staff:             'ሠራተኛ',
    role_you:               'እርስዎ',

    // GPS ping
    geo_not_supported:      'ጂኦ-ቦታ ይህ መሳሪያ/ዳሰሳ አይደግፍም።',
    geo_denied:             'የቦታ ፍቃድ ውድቅ ሆኗል። ክትትልን ለማጋራት ፍቃድ ያስሩ።',
    geo_failed:             'አሁን ያለ ቦታ ማግኘት አልተቻለም።',
    location_updated:       'ቦታ ዘምኗል ✓',
    ping_failed:            'ምልክት አልተሳካም። እንደገና ሞክሩ።',
    allow_location_prompt:  'ዳሰሳ ፕሮግራምዎ ሲጠይቅ ቦታ ፍቃድ ይስጡ።',
    allow_location_perm:    'ቀጣይ ክትትልን ለማስቻል ቦታ ፍቃድ ያስሩ።',

    // sign out
    sign_out: 'ውጣ',

    // help & support page
    help_title:         'እርዳታ እና ድጋፍ',
    help_subtitle:      'ፈጣን፣ ምቹ እርዳታ — ሲፈልጉ',
    help_contact_us:    'ያናግሩን',
    help_follow_us:     'ይከተሉን',
    help_support_soon:  'የድጋፍ ዝርዝሮች በቅርቡ ይመጣሉ።',
    help_ai_title:      'AI ረዳት',
    help_ai_sub:        'ምንም ይጠይቁ — ወዲያውኑ ብልህ መልሶች፣ 24/7',
    help_ask_ai:        'AI ረዳትን ጠይቁ',

    // wallet tabs
    wallet_tab:           'ዋሌት',
    history_tab:          'ታሪክ',
    invoices_tab:         'ደረሰኞች',
    add_funds_tab:        'ገንዘብ ጨምር',
    payouts_tab:          'ክፍያዎች',
    admin_payouts_title:  'የአስተዳዳሪ ክፍያዎች',
    no_payout_records:    'ምንም የክፍያ መዝገቦች የሉም።',
    wallet_credit:        'ዋሌት ክሬዲት',
    bank_transfer_label:  'የባንክ ዝውውር',
    commission_label:     'ኮሚሽን:',
    etb_deducted:         'ብር ተቀናሽ',
    order_label:          'ትዕዛዝ:',
    view_receipt:         'ደረሰኝ ይመልከቱ',

    // preferences tab
    pref_display_theme:     'ማሳያ ቀለም',
    pref_theme_light:       'ብሩህ',
    pref_theme_dark:        'ጨለማ',
    pref_theme_system:      'ስርዓት',
    pref_notifications:     'ማሳወቂያዎች',
    pref_notif_sub:         'SMS ለወሳኝ ማስጠቀሚያዎች ብቻ ነው።',
    notif_sms_label:        'SMS ማሳወቂያዎች',
    notif_sms_sub:          'ወሳኝ ዝማኔዎች ብቻ — የትዕዛዝ ሁኔታ፣ OTPs',
    notif_email_label:      'የኢሜይል ማሳወቂያዎች',
    notif_email_sub:        'የትዕዛዝ ማጠቃለያ፣ ደረሰኞች፣ የሒሳብ ማስጠቀሚያዎች',
    notif_browser_label:    'የቡድን ማሳወቂያዎች',
    notif_browser_sub:      'ሲዳስሱ ቅጽበታዊ የዌብ ማሳወቂያዎች',
    notif_telegram_label:   'Telegram ማሳወቂያዎች',
    notif_telegram_sub:     'በTelegram ቦት ቅጽበታዊ ማሳወቂያዎች',
    notif_orders_label:     'የትዕዛዝ ዝርዝሮች',
    notif_orders_sub:       'ሎጂስቲክስ ትዕዛዞቻቸው ሁኔታ ለውጦች',
    notif_promo_label:      'ማስተዋወቂያዎች',
    notif_promo_sub:        'ዜና፣ ቅናሾች እና የፕሌትፎርም ማስታወቂያዎች',

    // driver documents tab
    goto_offline:           'ወደ ኦፍላይን ሂድ',
    goto_online:            'ወደ ኦንላይን ሂድ',
    driver_available_sub:   '— ለትዕዛዞች ዝግጁ ነው',
    driver_offline_sub:     '— ትዕዛዞች አይቀበልም',
    driver_on_job_sub:      '— ጭነት በሂደት ላይ',
    driver_suspended_sub:   '— አስተዳዳሪን ያናግሩ',
    verif_docs_title:       'የማረጋገጫ ሰነዶች',
    account_verified_msg:   'ሒሳብዎ ሙሉ ተረጋግጧል!',
    doc_national_id:        'ብሔራዊ መታወቂያ',
    doc_license:            'የሹፌር ፈቃድ',
    doc_libre:              'ሊብሬ (የተሽከርካሪ ባለቤትነት)',
    uploading:              'በመጫን ላይ…',
    replace_file:           'ተካ',
    upload_file_label:      'ፋይል ጫን',
    doc_accepted_formats:   'ተቀባይ: JPG, PNG, WEBP, PDF · ከፍ. 8 MB',

    // phone change
    enter_new_phone_desc:  'አዲስ ቁጥርዎን ያስገቡ። OTP ለማረጋገጥ ይላካል።',
    send_otp_to_new:       'ወደ አዲስ ቁጥር OTP ላክ',
    sending_otp:           'OTP እየተላከ ነው…',
    phone_updated:         'ስልክ ቁጥር ተዘምኗል!',
    otp_sent_to:           'OTP ወደ',
    enter_it_below:        'ከዚህ በታች ያስገቡ።',
    six_digit_otp_label:   '6-ቁጥር OTP',
    back:                  'ተመለስ',
    verify_and_update:     'አረጋግጥ እና አዘምን',
    verifying_label:       'እያረጋገጠ…',

    // driver report
    rpt_driver_general:    'የሹፌር ዋና ሪፖርት',
    rpt_period:            'የሪፖርት ጊዜ',
    rpt_generated:         'ተፈጥሯል:',
    rpt_verified:          'ተረጋግጧል',
    rpt_pending_verif:     'ማረጋገጫ ይጠበቃል',
    rpt_no_vehicle:        'ንቁ ተሽከርካሪ የለም',
    rpt_approved:          'ጸድቋል',
    rpt_pending_approval:  'ፍቃድ ይጠበቃል',
    rpt_from:              'ከ',
    rpt_to:                'እስከ',
    rpt_apply:             'ተግብር',
    rpt_loading:           'የሹፌር ሪፖርት እየጫነ ነው…',
    rpt_error:             'ሪፖርቱን መጫን አልተቻለም። እንደገና ይሞክሩ።',
    kpi_total_jobs:        'ጠቅላላ ስራዎች',
    kpi_completed_sub:     'ጨርሷቸው',
    kpi_active_jobs:       'ንቁ ስራዎች',
    kpi_currently_moving:  'በሂደት ላይ',
    kpi_period_earnings:   'የጊዜ ክፍያ',
    kpi_lifetime:          'ሁሉ ጊዜ',
    kpi_distance:          'ርቀት',
    kpi_km_average:        'ኪሎሜትር አማካኝ',
    kpi_avg_rating:        'አማካኝ ደረጃ',
    kpi_reviews_sub:       'ግምገማዎች በጊዜ ውስጥ',
    kpi_cross_border:      'ድንበር አቋርጦ',
    kpi_avg_delivery:      'ሰ አማካኝ ማድረስ',
    chart_daily_jobs:      'ዕለታዊ ስራዎች፣ ጨርሷቸው እና ክፍያዎች',
    chart_status_breakdown:'የሥራ ሁኔታ ዝርዝር',
    chart_driver_snapshot: 'የሹፌር ቅጽበታዊ ሁኔታ',
    chart_rating_dist:     'የደረጃ ስርጭት',
    chart_recent_jobs:     'የቅርብ ጊዜ ስራዎች',
    chart_feedback:        'የቅርብ ጊዜ ላኪ ግብረ-መልስ',
    chart_doc_review:      'የሰነድ ምልክት ታሪክ',
    snap_phone:            'ስልክ',
    snap_email:            'ኢሜይል',
    snap_on_time_rate:     'ወቅቱ ምጣኔ',
    snap_streak:           'ተከታታይ',
    snap_days:             'ቀናት',
    snap_last_trip:        'ያለፈ ጉዞ',
    snap_documents:        'ሰነዶች',
    snap_vehicle:          'ተሽከርካሪ',
    snap_no_vehicle:       'ምንም ንቁ ተሽከርካሪ አልተሰጠም።',
    tbl_ref:               'ሬፍ',
    tbl_col_status:        'ሁኔታ',
    tbl_pickup:            'ፒክአፕ',
    tbl_delivery:          'ማድረሻ',
    tbl_distance:          'ርቀት',
    tbl_earnings:          'ክፍያ',
    tbl_created:           'ተፈጥሯል',
    tbl_no_jobs:           'በዚህ ጊዜ ምንም ስራዎች አልተገኙም።',
    no_comment:            'የተፃፈ አስተያየት የለም።',
    no_feedback:           'ምንም ደረጃ ግብረ-መልስ የለም።',
    no_review_note:        'ምንም የምልክት ማስታወሻ አልቀረበም።',
    no_doc_history:        'ምንም የሰነድ ምልክት ታሪክ የለም።',
    rpt_footer_self:       'የሹፌር ራስ ሪፖርት',

    // wallet dashboard
    wlt_available_balance:    'ያለ ቀሪ ሒሳብ',
    wlt_locked_label:         'ተቆልፏል',
    wlt_active_label:         'ነቃ',
    wlt_earned:               'የተላካ',
    wlt_spent:                'የተናፈቀ',
    wlt_pending_wd:           'ሲጠብቅ',
    wlt_request_withdrawal:   'ወጪ ጠይቅ',
    wlt_cancel_withdrawal:    'ወጪ ሰርዝ',
    wlt_wallet_locked:        'ዋሌት ተቆልፏል',
    wlt_locked_default:       'ዋሌትዎ ታግዷል። ድጋፍን ያናግሩ።',
    wlt_withdrawal_requests:  'የወጪ ጥያቄዎች',
    wlt_loading_requests:     'ጥያቄዎችን እየጫነ…',
    wlt_no_withdrawals:       'ምንም የወጪ ጥያቄዎች የሉም።',
    wlt_submit_request_above: 'ከላይ ጥያቄ ያቅርቡ እዚህ ይታያል።',
    wlt_recent_transactions:  'የቅርብ ጊዜ ልውውጦች',
    wlt_no_transactions:      'ምንም ልውውጦች የሉም።',
    wlt_withdrawal_req_title: 'የወጪ ጥያቄ',
    wlt_amount_label:         'ለማውጣት መጠን (ብር)',
    wlt_available_label:      'ያለ:',
    wlt_pct_of_balance:       '% ቀሪ ሒሳብ',
    wlt_bank_name:            'የባንክ ስም',
    wlt_account_number:       'የሒሳብ ቁጥር',
    wlt_account_holder:       'የሒሳብ ባለቤት ስም',
    wlt_note_optional:        'ማስታወሻ / መልዕክት (አማራጭ)',
    wlt_attach_receipt:       'ደረሰኝ / ሰነድ ያያይዙ (አማራጭ፣ ከፍ. 5 MB)',
    wlt_remove:               'አስወግድ',
    wlt_submitting:           'እየቀረበ…',
    wlt_submit_request_btn:   'የወጪ ጥያቄ አቅርብ',
    wlt_request_submitted:    'ጥያቄ ቀርቧል!',
    wlt_request_submitted_sub:'አስተዳዳሪ ሲፈትሸ ማሳወቂያ ይደርሰዎታል።',
    wlt_approved_label:       'ጸድቋል:',
    wlt_platform_fee:         'የፕሌትፎርም ክፍያ',
    wlt_your_note:            'እርስዎ ማስታወሻ:',
    wlt_your_proof:           'እርስዎ ማስረጃ ሰነድ',
    wlt_view_pdf:             'PDF ይመልከቱ',
    wlt_admin_note:           'አስተዳዳሪ ማስታወሻ:',
    wlt_admin_confirmation:   'አስተዳዳሪ ማረጋገጫ',
    wlt_no_wallet:            'ምንም የዋሌት መረጃ የለም።',

    // transaction history
    txhist_title:         'የልውውጥ ታሪክ',
    txhist_search_ph:     'ልውውጦችን ፈልጉ...',
    txhist_filter_all:    'ሁሉም ልውውጦች',
    txhist_filter_credits:'ክሬዲቶች',
    txhist_filter_debits: 'ዴቢቶች',
    txhist_filter_bonuses:'ቦነሶች',
    txhist_filter_tips:   'ጉርሻዎች',
    txhist_filter_refunds:'ተመላሾች',
    txhist_no_found:      'ምንም ልውውጦች አልተገኙም',
    txhist_receipt_btn:   'ደረሰኝ',
    txhist_previous:      'ወደ ኋላ',
    txhist_next:          'ቀጣይ',
    txhist_page:          'ገጽ',
    tx_credit:            'ክሬዲት',
    tx_debit:             'ዴቢት',
    tx_commission:        'ኮሚሽን',
    tx_tip:               'ጉርሻ',
    tx_refund:            'ተመላሽ',
    tx_bonus:             'ቦነስ',
    tx_adjustment:        'ማስተካከያ',
  },
}

// ─── Context type ─────────────────────────────────────────────────────────────
interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  toggleLang: () => void
  /** Translate a key. Falls back to 'en' then to the key itself. */
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'al_lang'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'am' ? 'am' : 'en'
  })

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l)
    setLangState(l)
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === 'en' ? 'am' : 'en')
  }, [lang, setLang])

  const t = useCallback((key: string): string => {
    return translations[lang][key]
      ?? translations['en'][key]
      ?? key
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
