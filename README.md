<img width="277" height="325" alt="Screenshot 2026-01-04 200018" src="https://github.com/user-attachments/assets/d84e0a77-2f1a-4a1b-94ba-5abd35787ba6" />


#  Medicude: AI-Powered Pharmacy Management System


**Medicude** is a sophisticated full-stack solution designed to modernize pharmacy operations. By integrating AI-driven automation for stock management and financial tracking, it reduces manual data entry and provides real-time business insights for pharmacy owners.

## 🚀 Key Features

* **🤖 AI Invoice Automation** – Automatically update inventory by uploading PDF or images of purchase invoices. The AI parses the data and syncs it with your stock.
* **📊 FinTrack (Finance Management)** – Dedicated section for tracking daily sales, profit margins, and overhead expenses.
* **💡 AI Pharmacy Assistant** – A built-in chat assistant that provides "status hints" (e.g., suggesting reorders for low-stock items or identifying expiring medicines).
* **👥 Multi-Role Access Control** – Secure authentication with distinct permissions for **Admins** (owners) and **Workers** (staff).
* **☁️ Cloud-First Architecture** – Automatic backups and cloud storage to ensure data integrity and accessibility from any device.

---

## 🛠️ Tech Stack

### **Backend (Core Logic)**

* **Node.js & Express.js** – Handling RESTful API architecture.
* **Authentication:** JWT (JSON Web Tokens) for secure, role-based session management.
* **AI Integration:** Integration with Gemini/OpenAI for invoice parsing and assistant logic.
* **Database:** MongoDB (suggested) / PostgreSQL for managing complex medicine schemas.
* **File Handling:** Multer & Cloudinary/AWS S3 for processing and storing invoices.

### **Frontend**

* **React.js (Vite)** – Fast, component-based user interface.
* **Tailwind CSS** – Custom utility-first styling for a professional dashboard feel.
* **State Management:** React Context API or Redux for handling global pharmacy state.

---

## 📂 Backend Project Structure

```text
medicude-backend/
├── controllers/         # Logic for Stock, Auth, and FinTrack
├── models/              # Database schemas (Medicine, User, Invoice)
├── routes/              # API Endpoints (e.g., /api/inventory, /api/ai-parse)
├── middleware/          # Auth guards and Role-based access logic
├── utils/               # AI Assistant and PDF parsing helpers
├── .env                 # Environment variables (API Keys, DB URI)
└── server.js            # Main entry point

```

---

## ⚙️ Backend Installation & Setup

1. **Clone the repository:**
```bash
git clone https://github.com/lalitkumar100/mediCude-backend
cd medicude-backend

```


2. **Install dependencies:**
```bash
npm install

```


3. **Configure Environment Variables:**
Create a `.env` file in the root directory:
```env

# Use connection string only

PG_HOST=dpg-d5msivcmrvns73fc97q0-a.singapore-postgres.render.com
PG_USER=t
PG_PASSWORD=6neSRXaoiwv9AHpCzpjv4vKoXUfXPb1S
PG_DATABASE=medicude
PG_PORT=5432

# PG_HOST=localhost
# PG_USER=postgres
# PG_PASSWORD=a
# PG_DATABASE=postgres
# PG_PORT=5432

NODE_ENV=production
PORT=5000
JWT_SECRET=JAIBWFADSVTIAPOALBWBOB
# .env file
SECRET_ROUTE_KEY=JAMJLFAZPVALBWBOB
GEMINI_API_KEY=AIzaSyDKYJh5-Xp44His92XhCGsJbMMU9rT7Cxw





```


4. **Run the server:**
```bash
npm run dev

```


*The server will start on `http://localhost:5000*`

---

## 🧬 API Workflow: Invoice Parsing

1. **Upload:** User sends a `POST` request to `/api/stock/upload-invoice` containing a PDF/Image.
2. **AI Processing:** The backend utilizes the `utils/aiParser.js` to extract:
* Medicine Name
* Batch Number
* Expiry Date
* Quantity & Unit Price


3. **Validation:** The controller validates the extracted data against existing inventory.
4. **Update:** Inventory is updated, and a summary is sent back to the frontend for confirmation.

---

## 👨‍💻 Author

**Lalitkumar Choudhary**
*Computer Science Engineer | Full Stack Developer*

---

Would you like me to help you write the specific **Express Controller** that handles the AI parsing of those invoices?
