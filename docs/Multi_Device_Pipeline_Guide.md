# Multi-Device No-Code Data Pipeline to Firestore

This guide provides step-by-step instructions to configure a zero-maintenance health telemetry pipeline on **Make.com** (formerly Integromat). This pipeline automatically pushes sleep data from **Sleep as Android** (connected to Galaxy Watch) and workout logs from **Strava** (synced from Hevy App) directly into your Firestore database.

---

## Part 1: Authenticate Make.com with Firestore

Make.com connects securely to Firebase using a Google Cloud Service Account Key, allowing it to perform read/write operations without client-side authentication headers.

### Step A: Generate Service Account Key in Firebase
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your project and click the gear icon (**Project Settings**).
3. Navigate to the **Service Accounts** tab.
4. Click **Generate New Private Key**, then confirm.
5. Save the downloaded JSON file securely. It contains:
   * `project_id`
   * `client_email`
   * `private_key`

### Step B: Create Firestore Connection in Make.com
1. Add a **Google Cloud Firestore** module to your Make scenario.
2. Under the **Connection** dropdown, click **Add**.
3. Fill in the connection form using the values from your downloaded service account key JSON file:
   * **Project ID**: Map to `project_id`
   * **Client Email**: Map to `client_email`
   * **Private Key**: Paste the entire `private_key` value (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`).
4. Click **Save**.

---

## Part 2: Pipeline 1 — Sleep as Android to Firestore

Sleep as Android can trigger a POST webhook request automatically when you stop sleep tracking in the morning.

```
[Sleep as Android App] (POST Webhook) ➔ [Make Webhook Listener] ➔ [Firestore Upsert]
```

### Step A: Configure Make.com Webhook Listener
1. Create a new Scenario in Make.com.
2. Add a **Webhooks** module and choose the **Custom Webhook** trigger.
3. Click **Add** to generate a new Webhook URL. Copy this URL.
4. Click **Redetermine Data Structure** to prepare the webhook for testing.

### Step B: Configure the Sleep as Android Phone App
1. Open **Sleep as Android** on your phone.
2. Go to **Settings** ➔ **Services** ➔ **Webhooks**.
3. Paste your Make.com Webhook URL into the target address field.
4. Click **Test** or run a simulation in the app to send a test payload.
5. Confirm in Make.com that the test payload was successfully caught and parsed.

### Step C: Parse Sleep Payload in Make.com
The app transmits JSON fields including sleep duration and quality.
1. Add a **Google Cloud Firestore** module ➔ **Create/Update a Document**.
2. **Document ID**: Set to `formatDate(now; YYYY-MM-DD)` (maps to the target daily key).
3. **Path**: `/users/{userId}/health_metrics/{date}`
   * *Replace `{userId}` with your Firebase User UID.*
4. **Fields to write**:
   * **`sleep_hours`**: Map to sleep duration in hours (if the payload outputs minutes, use `{{webhookPayload.duration / 60}}`).
   * **`sleep_score`**: Map to sleep rating/quality score (typically scale 0–100 or mapped percentage).
5. **Upsert Setting**: Ensure you select **Update/Merge** (or set document writing flags to merge) so it does not overwrite workout data logged for that same day.

---

## Part 3: Pipeline 2 — Hevy & Strava Workouts to Firestore

Hevy automatically publishes workouts to Strava. Make.com listens to Strava for new activity logs.

```
[Hevy App Workout] ➔ [Strava Sync] ➔ [Make Strava Trigger] ➔ [Firestore Upsert]
```

### Step A: Connect Strava to Make.com
1. Create a new Scenario in Make.com.
2. Add a **Strava** module and choose the **Watch Activities** trigger.
3. Click **Add** to create a connection, log in to your Strava account, and authorize access.
4. Set the polling frequency (e.g. check every 15 minutes).

### Step B: Formulate and Map Metrics
Strava outputs durations in seconds, which must be converted to minutes, and uses activity types (like `WeightTraining` or `Run`).
1. Add a **Google Cloud Firestore** module ➔ **Create/Update a Document** (or use the *Upsert* document action).
2. Set the collection path matching the target user: `/users/{userId}/health_metrics`
3. **Document ID (Date)**: Set to your workout date converted to `YYYY-MM-DD` timezone format:
   ```text
   {{formatDate(activity.start_date; "YYYY-MM-DD")}}
   ```
4. **Fields to write**:
   * **`workout_duration`**: Convert seconds to minutes. Use Make.com's math evaluator:
     ```text
     {{round(activity.moving_time / 60)}}
     ```
   * **`workout_type`**: Map workout classification using a conditional formula.
     For example, to categorize Strava's `WeightTraining` as `Lifting`, and other cardio exercises as `Cardio`:
     ```text
     {{if(activity.type = "WeightTraining"; "Lifting"; "Cardio")}}
     ```
5. Set document flags to **Merge/Update** to append this workout log to the day's existing sleep metrics.

---

## Part 4: Alternative Setup using Google Cloud Firestore "Make an API Call" (PATCH)

If you prefer to authenticate using OAuth 2.0 Web Application credentials instead of a Service Account JSON file, you can replace the HTTP module with the **Google Cloud Firestore -> Make an API Call** module. 

Since this module manages auth tokens automatically using your OAuth Connection, you don't need to pass authorization headers. You only need to define relative URLs, HTTP methods, and the request payload.

### Crucial Architectural Rules
1. **Decouple the Payloads**: The Strava scenario must **only** update workout fields. The Sleep scenario must **only** update sleep fields.
2. **Use updateMask**: You MUST append `updateMask.fieldPaths` query parameters to the URL. This tells Firestore *only* to update the fields specified, preserving any existing data in the document.

---

### 1. Firestore Module for Strava Scenario
* **Connection**: Select your custom OAuth Connection.
* **Method**: `PATCH`
* **URL**:
  ```text
  /v1/projects/{projectId}/databases/(default)/documents/artifacts/auto-anki-app/users/{userId}/health_metrics/{{formatDate(activity.start_date; "YYYY-MM-DD")}}?updateMask.fieldPaths=date&updateMask.fieldPaths=workout_duration&updateMask.fieldPaths=workout_type&updateMask.fieldPaths=timestamp
  ```
* **Headers**:
  * Key: `Content-Type`, Value: `application/json`
* **Body (JSON)**:
  ```json
  {
    "fields": {
      "date": { "stringValue": "{{formatDate(activity.start_date; "YYYY-MM-DD")}}" },
      "workout_duration": { "integerValue": {{round(activity.moving_time / 60)}} },
      "workout_type": { "stringValue": "{{if(activity.type = "WeightTraining"; "Lifting"; "Cardio")}}" },
      "timestamp": { "stringValue": "{{activity.start_date}}" }
    }
  }
  ```

---

### 2. Firestore Module for Sleep Scenario
* **Connection**: Select the **same** custom OAuth Connection.
* **Method**: `PATCH`
* **URL**:
  ```text
  /v1/projects/{projectId}/databases/(default)/documents/artifacts/auto-anki-app/users/{userId}/health_metrics/{{formatDate(now; "YYYY-MM-DD")}}?updateMask.fieldPaths=date&updateMask.fieldPaths=sleep_hours&updateMask.fieldPaths=sleep_score&updateMask.fieldPaths=timestamp
  ```
* **Headers**:
  * Key: `Content-Type`, Value: `application/json`
* **Body (JSON)**:
  ```json
  {
    "fields": {
      "date": { "stringValue": "{{formatDate(now; "YYYY-MM-DD")}}" },
      "sleep_hours": { "doubleValue": {{ext(webhookPayload; "length")}} },
      "sleep_score": { "integerValue": "{{round(ext(webhookPayload; "rating") * 100)}}" },
      "timestamp": { "stringValue": "{{now}}" }
    }
  }
  ```

