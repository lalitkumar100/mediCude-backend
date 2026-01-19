// File: routes/todoRoutes.js
const pool = require('../config/db');
const asyncHandler = require('../services/asyncHandler');

// ==============================
// Create a new To-Do
// ==============================
const addToDo =asyncHandler(async (req, res) => {

    const { employee_id, title, description, priority, due_date } = req.body;

    const result = await pool.query(
      `INSERT INTO todo_list (employee_id, title, description, priority, due_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [employee_id, title, description, priority, due_date]
    );

    res.status(201).json({ todo: result.rows[0] }) });

// ==============================
// Get all To-Dos (with optional filters)
// ==============================
const getAllTodos =asyncHandler( async (req, res) => {
    const { employee_id, status, priority } = req.query;
    let baseQuery = 'SELECT * FROM todo_list WHERE true';
    const params = [];

    if (employee_id) {
      params.push(employee_id);
      baseQuery += ` AND employee_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      baseQuery += ` AND status = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      baseQuery += ` AND priority = $${params.length}`;
    }

    const result = await pool.query(baseQuery, params);
    res.json({ todos: result.rows });
}
)

// ==============================
// Get a specific To-Do by ID
// ==============================
const getTodoById = asyncHandler(async (req, res) => {
 
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM todo_list WHERE todo_id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'To-Do not found' });
    }

    res.json({ todo: result.rows[0] });
 
});

// ==============================
// Update a To-Do
// ==============================
const updateTodo = asyncHandler(async (req, res) => {

    const { id } = req.params;
    const { title, description, priority, status, due_date } = req.body;

    const result = await pool.query(
      `UPDATE todo_list
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           priority = COALESCE($3, priority),
           status = COALESCE($4, status),
           due_date = COALESCE($5, due_date),
           updated_at = CURRENT_TIMESTAMP
       WHERE todo_id = $6
       RETURNING *`,
      [title, description, priority, status, due_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'To-Do not found' });
    }

    res.json({ 
        status :"success",
        message :`update todo -${id} successfull `,
        todo: result.rows[0] });

}
);
// ==============================
// Delete a To-Do
// ==============================
const deleteTodo = asyncHandler(async (req, res) => {
 
    const { id } = req.params;
    const result = await pool.query('DELETE FROM todo_list WHERE todo_id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'To-Do not found' });
    }

    res.json({ message: 'To-Do deleted successfully' });

});

module.exports = {deleteTodo ,updateTodo ,getTodoById ,getAllTodos ,addToDo};
