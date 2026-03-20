# SpatialHub Deployment Verification Checklist

Run through this checklist before handing the SD card and website URL to a judge. Every item must PASS. If any item fails, fix it before proceeding -- the commands in the Fix column will help diagnose.

---

## 1. Cloud SQL

| Check | Command | Expected | Fix |
|-------|---------|----------|-----|
| Instance running | `gcloud sql instances describe spatialhub-db --project=nasa-comp-demo --format='value(state)'` | `RUNNABLE` | `gcloud sql instances patch spatialhub-db --activation-policy=ALWAYS --project=nasa-comp-demo` |
| Database exists | `gcloud sql databases list --instance=spatialhub-db --project=nasa-comp-demo --format='value(name)' \| grep spatialhub_db` | `spatialhub_db` | Re-run `deploy/deploy.sh` Section 2 |
| Tables migrated | `curl -s https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/ \| python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if isinstance(d, list) else 'FAIL')"` | `OK` | Run migrations: `USE_SQLITE=0 DB_HOST=... python manage.py migrate` (see deploy.sh Section 6) |
| Habitat zones seeded | `curl -s https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/habitat/zones/ \| python3 -c "import sys,json; print(len(json.load(sys.stdin)))"` | `4` | `USE_SQLITE=0 DB_HOST=... python manage.py seed_habitat_zones` with Cloud SQL env vars |

---

## 2. Cloud Run (Django API)

| Check | Command | Expected | Fix |
|-------|---------|----------|-----|
| Service healthy | `curl -s -o /dev/null -w "%{http_code}" https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/` | `200` | Redeploy: `gcloud run deploy spatialhub-backend --source . --region us-central1 --project nasa-comp-demo ...` (see deploy.sh Section 4) |
| Ingest endpoint works | `curl -s -o /dev/null -w "%{http_code}" -X POST https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/sensor-ingest/ -H "Content-Type: application/json" -d '{"hub_id":"checklist-test","sensor_name":"ph","sensor_val":7.0,"device_addr":"99","datetime":"2026-01-01T00:00:00Z","sensor_id":"chk-99","collection_type":"sensor_data","location":"Mars Habitat","owner":"Demo","workers":"Crew A"}'` | `201` | Check Cloud Run logs: `gcloud run services logs read spatialhub-backend --region us-central1 --project nasa-comp-demo --limit 20` |
| CORS configured | `curl -s -I -X OPTIONS https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/ -H "Origin: https://nasa-comp-demo.web.app" \| grep -i access-control` | Contains `access-control-allow-origin` | Check `CORS_ALLOWED_ORIGINS` in `django_backend/spatialhub_backend/settings.py` |

---

## 3. Firebase Hosting (Frontend)

| Check | Command | Expected | Fix |
|-------|---------|----------|-----|
| Site loads | `curl -s -o /dev/null -w "%{http_code}" https://nasa-comp-demo.web.app` | `200` | `cd spatialhub-frontend && npm run build && firebase deploy --only hosting --project nasa-comp-demo` |
| API URL configured | `curl -s https://nasa-comp-demo.web.app/assets/*.js 2>/dev/null \| grep -o 'spatialhub-backend[^"]*'` | Contains `spatialhub-backend-4vovlomqfa-uc.a.run.app` | Rebuild: `VITE_API_URL=https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api npm run build && firebase deploy --only hosting --project nasa-comp-demo` |

---

## 4. GCE VM (BioSim + Bridge + Control Loop)

> **Replace `{VM_IP}`** with the BioSim VM's static IP. Get it with:
> ```
> gcloud compute addresses describe spatialhub-biosim-ip --region=us-central1 --project=nasa-comp-demo --format='value(address)'
> ```
>
> **Replace `{VM_IP_DASHED}`** with the IP using dashes instead of dots (e.g., `34-56-78-90.sslip.io`).

| Check | Command | Expected | Fix |
|-------|---------|----------|-----|
| VM running | `gcloud compute instances describe spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo --format='value(status)'` | `RUNNING` | `gcloud compute instances start spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo` |
| BioSim responding | `curl -s -o /dev/null -w "%{http_code}" http://{VM_IP}:8009/api/simulation` | `200` | SSH: `gcloud compute ssh spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo --command="sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml logs biosim --tail 50"` |
| Bridge writing data | `curl -s "https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/?hub_id=biosim-habitat-01" \| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} rows')"` | `> 0 rows` | Check bridge logs: `gcloud compute ssh spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo --command="sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml logs bridge --tail 20"` |
| Control loop running | `gcloud compute ssh spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo --command="sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml ps control_loop"` | Status: `Up` or `running` | `gcloud compute ssh spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo --command="sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml restart control_loop"` |
| Open MCT accessible | `curl -s -o /dev/null -w "%{http_code}" http://{VM_IP}:9091` | `200` | Check openmct container: `gcloud compute ssh spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo --command="sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml logs openmct --tail 20"` |
| HTTPS proxy (Caddy) | `curl -s -o /dev/null -w "%{http_code}" https://{VM_IP_DASHED}.sslip.io/api/simulation` | `200` | Check Caddy: `gcloud compute ssh spatialhub-biosim --zone=us-central1-a --project=nasa-comp-demo --command="sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml logs caddy --tail 20"` |

---

## 5. End-to-End Verification

| Check | Command | Expected | Fix |
|-------|---------|----------|-----|
| Pi data in Cloud SQL | `curl -s "https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/?hub_id=pi-habitat-01" \| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} rows')"` | `> 0 rows` (if Pi is connected) | Start hub_client on Pi, verify `.env` has correct `DJANGO_URL` |
| Frontend shows BioSim data | Open `https://nasa-comp-demo.web.app/habitat` | Green "BioSim Connected" badge | Check VM is running, Caddy HTTPS is working (Section 4) |
| Frontend shows real sensor | Open `https://nasa-comp-demo.web.app/habitat`, wait 10s | Teal "BioSim + Real Sensor" badge | Verify Pi is sending data: check `/api/enriched/?hub_id=pi-habitat-01` returns rows |

---

## 6. Cost Management

| Action | Command | Notes |
|--------|---------|-------|
| Pause after demo | `./deploy/teardown.sh --stop` | Stops VM + Cloud SQL. ~$8/month idle (disk + static IP). Cloud Run scales to 0. |
| Full cleanup | `./deploy/teardown.sh --delete` | Destroys all resources. $0/month. **Deletes Cloud SQL data.** |
| Restart after stop | `DB_PASS="..." ./deploy/deploy.sh` | Idempotent. Starts stopped VM + Cloud SQL, redeploys if needed. |
