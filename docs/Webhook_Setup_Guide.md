# Webhook Integration & Make.com Setup Guide

This guide explains how to connect Android sleep tracking and workout apps (like Sleep as Android and Strava) to the AutoAnki Cloud Firestore backend.

## Ingestion Architecture

The React app acts as a **read-only consumer** of the health data. A daily automation pipeline running on Make.com securely pushes metrics directly to Firestore.

### Firestore Target Endpoint
- **Document Path:** `/artifacts/auto-anki-app/users/{userId}/health_metrics/{date}`
  - `{userId}`: The user's Firebase Anonymous/Google Auth UID (displayed in user settings or fetched via token).
  - `{date}`: The date string key in `YYYY-MM-DD` format (e.g. `2026-05-19`).

---

## JSON Payload Schema

Your automation pipeline must publish payloads adhering to the following JSON structure:

```json
{
  "date": "2026-05-19",
  "sleep_hours": 7.5,
  "sleep_score": 85,
  "workout_duration": 60,
  "workout_type": "Lifting",
  "timestamp": "2026-05-19T08:00:00.000Z"
}
```

### Field Details:
- **`date`** *(String)*: Unique date identifier matching the document ID (`YYYY-MM-DD`).
- **`sleep_hours`** *(Number)*: Sleep duration in hours.
- **`sleep_score`** *(Integer)*: Quality score (0 to 100).
- **`workout_duration`** *(Integer)*: Physical activity duration in minutes.
- **`workout_type`** *(String)*: Category of workout, must be one of: `"Lifting"`, `"Cardio"`, or `"None"`.
- **`timestamp`** *(String)*: ISO date-time sync string.

---

## Make.com Scenario Setup (Firestore - Make an API Call)

Rather than setting up complex OAuth client credential flows or service account credentials directly in React, we authenticate Make.com with Firestore using a **Google Cloud Firestore -> Make an API Call** module.

### Sleep as Android Event Filter
> [!IMPORTANT]
> In the Sleep as Android app settings (Webhooks -> Events), **only check `SLEEP_TRACKING_STOPPED`**. Uncheck all other events (snooze, light sleep, etc.) to prevent sending dozens of webhooks a night, which will consume your Make.com free-tier operations.

---

### Sleep as Android Module Setup
1. **Trigger**: Webhook listener receiving POST requests from Sleep as Android.
2. **Action**: **Google Cloud Firestore -> Make an API Call**
   * **Connection**: Select your existing custom Google OAuth connection.
   * **Method**: `PATCH`
   * **URL**:
     ```text
     /v1/projects/{projectId}/databases/(default)/documents/artifacts/auto-anki-app/users/{userId}/health_metrics/{{formatDate(now; "YYYY-MM-DD")}}?updateMask.fieldPaths=date&updateMask.fieldPaths=sleep_hours&updateMask.fieldPaths=sleep_score&updateMask.fieldPaths=timestamp
     ```
   * **Headers**:
     * Key: `Content-Type`, Value: `application/json`
   * **Body**:
     ```json
     {
       "fields": {
         "date": { "stringValue": "{{formatDate(now; "YYYY-MM-DD")}}" },
         "sleep_hours": { "doubleValue": {{webhookPayload.value1}} },
         "sleep_score": { "integerValue": "{{round(webhookPayload.value2 * 100)}}" },
         "timestamp": { "stringValue": "{{now}}" }
       }
     }
     ```
     *(Note: Replace `webhookPayload.value1` and `webhookPayload.value2` with your actual mapped variables from the Webhook trigger).*
