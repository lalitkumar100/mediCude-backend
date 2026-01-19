const pool = require('../config/db');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// --- CONFIGURATION ---
const apiKey = process.env.GEMINI_API_KEY;
const modelId = "gemini-2.5-flash-preview-09-2025"; // Main model for chat
const genAI = new GoogleGenerativeAI(apiKey);

let SYSTEM_PROMPT = "";
try {
    const filePath = path.join(__dirname, '../doc/prompt1.txt'); 
    SYSTEM_PROMPT = fs.readFileSync(filePath, 'utf-8');
} catch (e) {
    console.error("Critical Error: prompt1.txt not found at", path.join(__dirname, '../doc/prompt1.txt'));
}

// --- HELPERS ---

// Helper to convert file buffer to Gemini format

function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}

async function executeQueries(queryList) {
    if (!queryList || !Array.isArray(queryList) || queryList.length === 0) return null;
    const datasets = [];
    for (const q of queryList) {
        try {
            const res = await pool.query(q.sql);
            datasets.push({
                rows: res.rowCount,
                columns: res.fields ? res.fields.length : 0,
                data: res.rows,
                label: q.label || "Query Result"
            });
        } catch (dbErr) {
            console.error("Database Execution Error:", dbErr.message);
            datasets.push({ rows: 0, columns: 0, data: [], label: `Error: ${q.label}` });
        }
    }
    return datasets;
}

async function generateContentWithRetry(model, contentPayload) {
    const maxRetries = 3;
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await model.generateContent(contentPayload);
            return result.response.text();
        } catch (err) {
            if (i === maxRetries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

// --- EXPORTED CONTROLLERS ---

/**
 * Process Invoice Image/PDF
 * Extracts structured data (Wholesaler, Invoice No, Medicines) using AI
 */
const processInvoice = async (req, res, next) => {
    // 1. Validation: Ensure a file exists
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }

    try {
        // 2. Model Selection: Gemini 1.5 Flash is efficient for documents
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-preview-09-2025", 
        });

        const prompt = `
        You are an expert data entry assistant for a pharmacy. Analyze the provided invoice file.
        Extract the following information:
        1. Wholesaler or Distributor Name
        2. Invoice Number
        3. Invoice Date
        4. A list of all medicine items. For each medicine, extract:
            - Medicine Name
            - Brand Name
            - Manufacturing Date (mfg_date)
            - Expiry Date (expiry_date)
            - Packed Type (e.g., 'Strip', 'Box', 'Bottle')
            - Stock Quantity (qty)
            - Purchase Price per unit
            - MRP per unit
            - Batch Number (batch_no)

        Return the extracted data STRICTLY as a single JSON object. No markdown formatting.
        Structure:
        {
          "wholesaler": "string",
          "invoiceNumber": "string",
          "date": "YYYY-MM-DD",
          "medicines": [
            {
              "medicine_name": "string",
              "brand_name": "string",
              "mfg_date": "YYYY-MM-DD",
              "expiry_date": "YYYY-MM-DD",
              "packed_type": "string",
              "stock_quantity": "number",
              "purchase_price": "number",
              "mrp": "number",
              "batch_no": "string"
            }
          ]
        }
        If fields are missing, return null or empty string.
        `;

        // 3. File Processing: Converts Image OR PDF for the AI
        // req.file.buffer contains the raw data
        // req.file.mimetype tells AI if it's 'image/png', 'application/pdf', etc.
        const filePart = fileToGenerativePart(req.file.buffer, req.file.mimetype);

        // 4. Generate Content
        const result = await model.generateContent([prompt, filePart]);
        const responseText = result.response.text();

        // 5. Clean & Parse JSON
        const cleanedJsonString = responseText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const data = JSON.parse(cleanedJsonString);
        res.status(200).json(data);

    } catch (error) {
        console.error("Error processing invoice:", error);
        res.status(500).json({
            message: "Failed to process invoice. The AI model could not read the document."
        });
    }
};

/**
 * Main Analytics Pipeline
 */
/**
 * Main Analytics Pipeline - Supports Text + Image
 */
const getAnalyticsResponse = async (req, res, next) => {
    // 1. Extract file if it exists (Multer should be using memoryStorage)
    const file = req.file; 
    const { prompt, next_gen_summary, new_chat } = req.body;
    let { id } = req.params; 
    const login_id = req.user.login_id;

    const user_context = {
        user_id: req.user.employee_id,
        user_role: req.user.role,
        user_name: req.user.full_name
    };

    if (!prompt) {
        res.status(400);
        return next(new Error("Prompt is required"));
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // --- CHAT SESSION LOGIC (Same as your existing code) ---
        const isActuallyNew = new_chat || !id || id === 'null' || id === 'undefined';
        if (isActuallyNew) {
            id = uuidv4();
            const initialTitle = prompt.slice(0, 40) + "...";
            await client.query(
                `INSERT INTO chats (id, login_id, title, summary) VALUES ($1, $2, $3, $4)`,
                [id, login_id, initialTitle, 'New conversation started']
            );
        } else {
            const chatCheck = await client.query(
                'SELECT id FROM chats WHERE id = $1 AND login_id = $2',
                [id, login_id]
            );
            if (chatCheck.rowCount === 0) {
                res.status(404);
                throw new Error("Chat session not found or access denied.");
            }
        }

        // --- AI PREPARATION ---
        const model = genAI.getGenerativeModel({
            model: modelId,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { responseMimeType: "application/json" }
        });

        const userContentText = `
            [USER_CONTEXT] ${JSON.stringify(user_context)}
            [PREVIOUS_SUMMARY] ${next_gen_summary || 'None'}
            [USER_QUERY] ${prompt}
            [new_chat ]:${new_chat ?"new chat so please provide title":"title is not required old chat"}
        `;

        // 2. Build Multi-modal Content Payload
        let contentPayload;
        if (file) {
            // Convert the buffer to Gemini format
            const imagePart = fileToGenerativePart(file.buffer, file.mimetype);
            // Payload is an array of [text, image]
            contentPayload = [userContentText, imagePart];
        } else {
            // Payload is just the text string
            contentPayload = userContentText;
        }

        // 3. Generate content with the new payload
        const aiRawResponse = await generateContentWithRetry(model, contentPayload);
        const aiParsed = JSON.parse(aiRawResponse);

        // --- DATABASE EXECUTION (Same as your existing code) ---
        let queriesToRun = aiParsed.query_list || [];
        if (aiParsed.sql_query) queriesToRun.push(aiParsed.sql_query);
        const databaseResults = await executeQueries(queriesToRun);

        const totalRows = databaseResults ? databaseResults.reduce((acc, ds) => acc + ds.rows, 0) : 0;
        let finalOutro = aiParsed.ai_text.outro_message;
        if (totalRows === 0 && aiParsed.empty_result_fallback) {
            finalOutro = aiParsed.empty_result_fallback;
        }

        // --- RESPONSE PREPARATION ---
        const finalResponse = {
            chatId: id,
            title: aiParsed.title || null,
            ai_text: {
                intro_message: aiParsed.ai_text.intro_message,
                outro_message: finalOutro,
                to_canvas: aiParsed.ai_text.to_canvas
            },
            from_database: databaseResults,
            canvas: !!aiParsed.ai_text.to_canvas,
            next_gen_summary: aiParsed.next_gen_summary,
            intent_explanation: aiParsed.intent_explanation
        };

        const saveJsonDB = {
            userQuery: prompt,
            response: finalResponse,
            hasImage: !!file // Note for history if an image was involved
        };

        await client.query(
            `INSERT INTO chat_messages (id, chat_id, role, content) VALUES ($1, $2, $3, $4)`,
            [uuidv4(), id, req.user.role, JSON.stringify(saveJsonDB)]
        );

        if(new_chat){
            await client.query(
            `UPDATE chats SET last_message_at = NOW(), summary = $1, title = $2 WHERE id = $3`,
            [aiParsed.next_gen_summary || 'Updated', aiParsed.title || 'Untitled Chat', id]
        );
        }
        else{
           await client.query(
            `UPDATE chats SET last_message_at = NOW(), summary = $1 WHERE id = $3`,
            [aiParsed.next_gen_summary || 'Updated', id]
        ); 
        }

        await client.query('COMMIT');
        res.status(200).json(finalResponse);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Pipeline Error:", error);
        next(error);
    } finally {
        client.release();
    }
};

/**
 * Fetch Chat Menu
 */
const getChatMenu = async (req, res, next) => {
    const login_id = req.user?.login_id;
    try {
        const result = await pool.query(`
            SELECT id, title, TO_CHAR(created_at, 'YYYY-MM-DD') as date
            FROM chats 
            WHERE login_id = $1 
            ORDER BY last_message_at DESC;
        `, [login_id]);
        res.status(200).json(result.rows);
    } catch (error) {
        next(error);
    }
};

/**
 * Fetch Full Chat History
 */
const openChat = async (req, res, next) => {
    const { id } = req.params;
    const login_id = req.user?.login_id;

    try {
        const chatCheck = await pool.query(
            'SELECT id, title FROM chats WHERE id = $1 AND login_id = $2',
            [id, login_id]
        );

        if (chatCheck.rowCount === 0) {
            res.status(404);
            throw new Error("Chat not found.");
        }

        const messagesResult = await pool.query(
            `SELECT content, created_at FROM chat_messages 
             WHERE chat_id = $1 ORDER BY created_at ASC`,
            [id]
        );

        const formattedMessages = messagesResult.rows.map(msg => ({
            id: uuidv4(),
            userQuery: msg.content.userQuery,
            response: msg.content.response
        }));

        res.status(200).json({
            id: chatCheck.rows[0].id,
            title: chatCheck.rows[0].title,
            messages: formattedMessages
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAnalyticsResponse,
    getChatMenu,
    openChat,
    processInvoice // Exporting the new function
};