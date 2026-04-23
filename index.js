const { program } = require('commander');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('node:fs/promises');
const path = require('node:path');

// --- ЧАСТИНА 1: Параметри командного рядка ---
program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до директорії з кешем');

program.parse();
const options = program.opts();

const app = express();
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
try {
    const swaggerDocument = YAML.load('./swagger.yaml');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
    console.log("Файл swagger.yaml не знайдено");
}

// --- НАЛАШТУВАННЯ MULTER (для завантаження фото) ---
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        // Переконуємося, що папка існує перед збереженням
        await fs.mkdir(options.cache, { recursive: true });
        cb(null, options.cache);
    },
    filename: (req, file, cb) => {
        // Зберігаємо файл з унікальним ID та розширенням .jpg
        cb(null, uuidv4() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Мідлвари для парсингу даних
app.use(express.json()); // для PUT (application/json)
app.use(express.urlencoded({ extended: true })); // для /search (x-www-form-urlencoded)

// Локальне сховище (база даних у пам'яті)
let inventory = [];

// --- ЧАСТИНА 2: Реалізація WebAPI сервісу ---

// 1. GET /RegisterForm.html - Веб форма реєстрації
app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

// 2. GET /SearchForm.html - Веб форма пошуку
app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

// 3. POST /register - Реєстрація нового пристрою
app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;
    
    if (!inventory_name) {
        return res.status(400).send('Bad Request: inventory_name is required');
    }

    const newItem = {
        id: uuidv4(),
        name: inventory_name,
        description: description || '',
        photo: req.file ? req.file.filename : null
    };

    inventory.push(newItem);
    res.status(201).json(newItem); // Статус 201 Created
});

// 4. GET /inventory - Список всіх речей
app.get('/inventory', (req, res) => {
    const list = inventory.map(item => ({
        ...item,
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(list);
});

// 5. GET /inventory/<ID> - Інформація про конкретну річ
app.get('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');
    
    const response = {
        ...item,
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    };
    res.status(200).json(response);
});

// 6. PUT /inventory/<ID> - Оновлення імені або опису
app.put('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');

    if (req.body.name) item.name = req.body.name;
    if (req.body.description) item.description = req.body.description;
    
    res.status(200).json(item);
});

// GET /inventory/<ID>/photo - Отримання фото
app.get('/inventory/:id/photo', async (req, res) => {
    try {
        const item = inventory.find(i => i.id === req.params.id);
        
        // Перевірка чи існує запис і чи є у нього ім'я файлу фото 
        if (!item || !item.photo) {
            return res.status(404).send('Not Found: Image or Item does not exist'); 
        }

        const photoPath = path.resolve(options.cache, item.photo);

        // Перевірка чи фізично існує файл у папці кешу
        await fs.access(photoPath);

        // Обов'язковий хедер за завданням 
        res.setHeader('Content-Type', 'image/jpeg'); 
        res.sendFile(photoPath); 
    } catch (err) {
        console.error('Помилка при відправці фото:', err.message);
        if (!res.headersSent) {
            res.status(404).send('Photo file not found on disk'); 
        }
    }
});

// 8. PUT /inventory/<ID>/photo - Оновлення фото
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');
    
    if (req.file) {
        item.photo = req.file.filename;
        res.status(200).json(item);
    } else {
        res.status(400).send('No file uploaded');
    }
});

// 9. DELETE /inventory/<ID> - Видалення
app.delete('/inventory/:id', (req, res) => {
    const index = inventory.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).send('Not Found');
    
    inventory.splice(index, 1);
    res.status(200).send('Deleted');
});

// 10. POST /search - Пошук за ID (x-www-form-urlencoded)
app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;
    const item = inventory.find(i => i.id === id);
    
    if (!item) return res.status(404).send('Not Found');

    let result = { ...item };
    if (has_photo === 'true' && item.photo) {
        result.photo_url = `http://${options.host}:${options.port}/inventory/${item.id}/photo`;
    }
    res.status(200).json(result);
});

// Обробка 405 Method Not Allowed для неіснуючих методів на існуючих ендпоінтах
app.all('*', (req, res) => {
    res.status(405).send('Method Not Allowed');
});

// --- ЗАПУСК СЕРВЕРА ---
async function start() {
    try {
        // Перевірка/Створення папки кешу при запуску (вимога Частини 1)
        await fs.mkdir(options.cache, { recursive: true });
        
        app.listen(options.port, options.host, () => {
            console.log(`Сервер працює за адресою http://${options.host}:${options.port}`);
            console.log(`Папка кешу: ${path.resolve(options.cache)}`);
        });
    } catch (err) {
        console.error('Помилка при запуску сервера:', err.message);
        process.exit(1);
    }
}

start();