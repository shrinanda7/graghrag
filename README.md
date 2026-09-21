# GraphRAG Publication Engine with Tarjan Loop Compression

Welcome to the **GraphRAG Publication Engine**! This application implements state-of-the-art **Tarjan Strongly Connected Components (SCC)** loop compression and **Bridge-Aware preservation** to deliver ultra-precise, hallucination-free retrieval-augmented generation (RAG) over academic literature.

---

## 🚀 How to Run the Application in VS Code

Follow these clear, step-by-step instructions to get both the frontend UI and python backend running locally inside VS Code.

### Prerequisites
Make sure you have the following installed on your machine:
- **Python 3.10+**
- **Node.js 18+ & npm**
- **VS Code**

---

### Step 1: Set Up Python Virtual Environment (`venv`)

1. Open your terminal in VS Code (`Ctrl + ~` or `Cmd + ~`).
2. Navigate to the project root directory.
3. Create a python virtual environment:
   ```bash
   python -m venv venv
   ```
4. Activate the virtual environment:
   - **Windows (Command Prompt):**
     ```cmd
     venv\Scripts\activate.bat
     ```
   - **Windows (PowerShell):**
     ```powershell
     venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux:**
     ```bash
     source venv/bin/activate
     ```

---

### Step 2: Install Python Dependencies

With your virtual environment active (`(venv)` should appear in your terminal prompt), run:
```bash
pip install -r requirements.txt
```

---

### Step 3: Run the Integrated Compression Q&A Trainer Demo

We have developed a standalone, interactive training and verification script (`run_qa_trainer.py`) to test and evaluate the decision-maker engine locally:
```bash
python run_qa_trainer.py
```
This interactive script:
- Verifies your Neo4j database connection
- Demonstrates **Tarjan's SCC Compression** and calculates **Focus Index** and **Fracture Rate**
- Provides an interactive Q&A loop that grades your answers against critical keywords
- Demonstrates **Kannada (ಕನ್ನಡ)** translation and regional support!

---

### Step 4: Run the Full-Stack Application Dev Server

To run the complete web UI (with Cytoscape interactive graph explorer, green Compression QA suite, voice-to-text input, and real-time streaming answers):

1. **Install Frontend Dependencies:**
   ```bash
   npm install
   ```
2. **Start the Express & Vite Dev Server:**
   ```bash
   npm run dev
   ```
3. Open your browser to [http://localhost:3000](http://localhost:3000) to interact with the application.

---

## 🛠️ Environment Configuration (`.env`)

Create a `.env` file in the root directory and add your credentials if you wish to connect to a live Neo4j instance or leverage Gemini AI features:
```env
# Neo4j Settings (Optional)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Gemini API Key (Required for live AI grounding)
GEMINI_API_KEY=your_gemini_api_key_here
```
*(If no credentials are provided, the application automatically triggers premium, local, mathematically grounded fallbacks so that you can explore all features offline without any setup errors.)*
