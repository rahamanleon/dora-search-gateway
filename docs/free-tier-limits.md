# Free-Tier Quota Limits & Spending Protection

Dora Search is engineered to run at **$0 infrastructure cost** across independent free hosting tiers. Because some cloud providers require a credit card during signup, strict spending protections must be enforced to eliminate accidental charges.

---

## 1. Hosting Target Comparison

| Platform | Role | Monthly Free Quota | Inactivity / Sleep Behavior | Hard Quota Enforced? |
| :--- | :--- | :--- | :--- | :--- |
| **Oracle Cloud** | Primary Persistent Host | 4 OCPU ARM Ampere + 24GB RAM (or 2 AMD x86 1GB RAM) Always Free | Never sleeps (persistent 24/7) | Yes (Always Free resources never charge) |
| **Google Cloud Run** | Backup 1 Container | 2,000,000 requests/mo, 360,000 GB-sec, 180,000 vCPU-sec | Scales down to 0 instances when idle | No (charges if traffic exceeds free tier) &rarr; **Spending cap required** |
| **Render** | Backup 2 Emergency Fallback | 750 free instance hours/month, 512MB RAM, 100GB bandwidth | Sleeps after 15 min idle (cold start ~50s) | Yes (will suspend or refuse traffic rather than charge) |
| **Cloudflare Workers**| API Gateway & Failover Router | 100,000 requests/day (3,000,000 requests/month) | Global edge distribution, instant execution | Yes (HTTP 1015 error returned if daily quota exceeded) |

---

## 2. Spending Protections & Cost Mitigation

### A. Google Cloud Run (Billing Protection)
Cloud Run is attached to a billing account. If an external bot attacks the Cloud Run endpoint directly, it could scale up instances and incur costs unless strictly capped.

#### Implemented Mitigations:
1. **Concurrency & Instance Hard Limit**:
   In `deployment/cloud-run/deploy.sh`:
   ```bash
   --max-instances 1 \
   --min-instances 0 \
   --memory 512Mi \
   --cpu 1 \
   --concurrency 15 \
   --timeout 10s
   ```
   Setting `--max-instances 1` ensures Google Cloud will **never launch more than a single container**. Even under maximum continuous load, 1 container with 512MB memory and 1 vCPU running for 730 hours will stay within or very close to the free tier limits.
2. **Sequential Failover Only**:
   The Cloudflare Gateway queries Oracle first. Cloud Run is only contacted if Oracle is unavailable, keeping Cloud Run requests near zero under normal conditions.
3. **Google Cloud Budget Alert**:
   Set a monthly budget alert at **$1.00 USD**:
   - Go to Google Cloud Console &rarr; **Billing** &rarr; **Budgets & alerts**.
   - Create a budget of `$1.00`.
   - Enable "Threshold alerts at 50%, 90%, and 100%".
   - Optionally attach a Cloud Function or Pub/Sub topic to disable billing automatically.

### B. Oracle Cloud Always Free
1. **Always Free Guarantee**:
   Resources designated "Always Free" in Oracle Cloud Infrastructure (OCI) do not incur charges even when trial credits expire.
2. **Idle Reclaim Warning**:
   Oracle Cloud monitors VM utilization. If CPU utilization is less than 20% over 7 days and network/RAM usage is negligible, Oracle may mark the instance idle.
   *Mitigation*: Running SearXNG + Valkey + Caddy with periodic gateway health probes keeps the instance safely active.

### C. Render Free Tier
1. **Memory Ceiling**:
   Render Free provides **512MB RAM**. If SearXNG consumes more than 512MB, the container will be OOM-killed.
   *Mitigation*: In `deployment/render/settings-render.yml`, the Valkey limiter is disabled and worker threads are constrained to maintain memory consumption below 250MB.
2. **Spin-Down & Cold Starts**:
   Render Free containers spin down after 15 minutes of inactivity. The first request after sleep will take 45–60 seconds.
   *Mitigation*: Render is assigned Priority 3 (Emergency Fallback). It is only invoked if both Oracle and Cloud Run are unavailable.

### D. Cloudflare Workers Free Tier
1. **Daily Limit**:
   100,000 requests per UTC day.
2. **CPU Limit**:
   10ms CPU execution time per request (network I/O wait time does not count against this limit).
   *Mitigation*: Sliding-window rate limiting prevents single abusive IPs from draining the daily quota.

