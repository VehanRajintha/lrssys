# AWS VPS Automated Deployment Guide (Lightsail / EC2)

This directory contains everything needed to deploy **LRSYS** onto an AWS VPS (e.g. Amazon Lightsail or EC2 running Ubuntu 22.04 or 24.04 LTS) with **PM2** process management and an **Nginx** reverse proxy in a single automated command.

---

## 1. Quick Launch on AWS Lightsail (Recommended: $5 - $10 / month)

1. Go to the [AWS Lightsail Console](https://lightsail.aws.amazon.com/).
2. Click **Create instance**.
3. Select:
   - **Platform**: Linux/Unix
   - **Blueprint**: OS Only -> **Ubuntu 22.04 LTS** or **24.04 LTS**
   - **Instance Plan**: $10/month (2 GB RAM, 1 or 2 vCPUs recommended for concurrent image processing).
4. Name your instance (e.g. `lrsys-terminal`) and click **Create instance**.
5. Once running, click the **Connect using SSH** button or connect via your terminal.

---

## 2. In Networking (Firewall Rules)
In the Lightsail **Networking** tab for your instance, ensure these ports are open:
- **SSH (22)**
- **HTTP (80)**
- **HTTPS (443)**

---

## 3. One-Command Automated Setup

In your VPS terminal, run:

```bash
# Clone your repository
git clone https://github.com/VehanRajintha/lrssys.git
cd lrssys

# Create your .env.local with your keys
nano .env.local
```
*(Paste your `GEMINI_API_KEY`, `GEMINI_BACKUP_API_KEY`, `GEMINI_API_KEY_3`, and Supabase keys, then press `Ctrl+O`, `Enter`, and `Ctrl+X` to save).*

Now run the automated setup:
```bash
sudo bash deploy/setup-vps.sh
```

### That's it! 
The script automatically:
- Installs Node.js 20 LTS, build tools, Nginx, and PM2.
- Configures the firewall.
- Builds the Next.js app in production mode.
- Sets up Nginx reverse proxy with:
  - 250MB upload limits (supports large ZIP batches)
  - 10-minute proxy timeouts (no timeout drops)
  - WebSockets & real-time stream headers
- Starts the app with PM2 and enables auto-restart on system reboot.
- Prints your live URL (`http://<YOUR-SERVER-IP>`).

---

## 4. Useful Operations

### View live logs
```bash
pm2 logs lrsys
```

### Restart app
```bash
pm2 restart lrsys
```

### Update to the latest Git commit (1-click)
```bash
bash deploy/update.sh
```

### Enable Free SSL / HTTPS (Let's Encrypt)
Once you point your domain (e.g. `cusdec.yourdomain.com`) to your VPS IP:
```bash
sudo certbot --nginx -d cusdec.yourdomain.com
```
Certbot will configure SSL automatically and auto-renew it forever.
