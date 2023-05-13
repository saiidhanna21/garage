if (process.env.NODE_ENV !== 'production') {
	require('dotenv').config();
}

const express = require('express');
const app = express();
const bcrypt = require('bcrypt');
const passport = require('passport');
const session = require('express-session');
const flash = require('connect-flash');
const mysql = require('mysql');
const ejsMate = require('ejs-mate');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');
const ExpressError = require('./ExpressError');

app.engine('ejs', ejsMate);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const db = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER_NAME,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
});

db.connect((err) => {
	if (!err) {
		console.log('DB connection succeeded');
	} else {
		console.log(
			'DB connection failed \n Error: ' + JSON.stringify(err, undefined, 2)
		);
	}
});

users = [];

users.push({
	id: Date.now().toString(),
	name: 'Admin',
	email: process.env.LOGIN_ID,
	password: process.env.LOGIN_PASSWORD,
});

const initializePassport = require('./passport-config');
initializePassport(
	passport,
	(email) => users.find((user) => user.email === email),
	(id) => users.find((user) => user.id === id)
);

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(flash());
app.use(
	session({
		secret: process.env.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
	})
);
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));

app.use((req, res, next) => {
	res.locals.errorMessage = req.flash('error');
	res.locals.successMessage = req.flash('success');
	next();
});

app.get('/', (req, res) => {
	res.render('home.ejs');
});

app.get('/login', checkNotAuthenticated, (req, res) => {
	res.render('users/login.ejs');
});

app.post(
	'/login',
	checkNotAuthenticated,
	passport.authenticate('local', {
		successRedirect: '/',
		failureRedirect: '/login',
		failureFlash: true,
	})
);

app.get('/customers', checkAuthenticated, (req, res) => {
	const sql =
		'SELECT customers.*, COUNT(orders.id) AS total_orders FROM customers LEFT JOIN orders ON customers.id = orders.customer_id GROUP BY customers.id';
	db.query(sql, (err, result) => {
		if (err) {
			throw err;
		}
		res.render('customers.ejs', { customers: result });
	});
});

// Add a new customer
app.post('/customers', checkAuthenticated, (req, res) => {
	const { name, email, phone } = req.body;

	checkEmailExists(req, email, (err, exists) => {
		if (err) {
			throw err;
		}

		if (exists) {
			req.flash('error', 'Email already exists');
			res.redirect('/customers');
		} else {
			const sql = 'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)';
			db.query(sql, [name, email, phone], (err, result) => {
				if (err) {
					throw err;
				}
				req.flash('success', 'Customer Added Succefully');
				res.redirect('/customers');
			});
		}
	});
});

app.delete('/customers/:id', (req, res) => {
	const customerId = req.params.id;
	db.query(
		'DELETE FROM customers WHERE id = ?',
		[customerId],
		(err, result) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			if (result.affectedRows === 0) {
				res.sendStatus(404);
				return;
			}
			req.flash('success', 'Customer Deleted Succefully');
			res.redirect('/customers');
		}
	);
});
//Products

app.get('/products', checkAuthenticated, (req, res) => {
	db.query('SELECT * FROM products', (err, result) => {
		if (err) {
			console.log(err);
			res.sendStatus(500);
			return;
		}
		res.render('products.ejs', { products: result });
	});
});

app.post('/products', checkAuthenticated, (req, res) => {
	const product = req.body;
	db.query(
		'INSERT INTO products (name, universal_product_code) VALUES (?, ?)',
		[product.name, product.upc],
		(err, result) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			const newProduct = {
				name: product.name,
				upc: product.upc,
			};
			req.flash('success', 'Product Added Succefully');
			res.redirect('/products');
		}
	);
});

app.delete('/products/:id', checkAuthenticated, (req, res) => {
	const productId = req.params.id;
	db.query('DELETE FROM products WHERE id = ?', [productId], (err, result) => {
		if (err) {
			console.log(err);
			res.sendStatus(500);
			return;
		}
		if (result.affectedRows === 0) {
			res.sendStatus(404);
			return;
		}
		req.flash('success', 'Product Deleted Succefully');
		res.redirect('/products');
	});
});
//garage_items

app.get('/garageItems', checkAuthenticated, (req, res) => {
	db.query('SELECT * FROM garage_items', (err, garageItemsResult) => {
		if (err) {
			console.log(err);
			res.sendStatus(500);
			return;
		}
		db.query('SELECT * FROM categories', (err, categoriesResult) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			db.query('SELECT * FROM products', (err, productsResult) => {
				if (err) {
					console.log(err);
					res.sendStatus(500);
					return;
				}
				res.render('garageItems.ejs', {
					garageItems: garageItemsResult,
					categories: categoriesResult,
					products: productsResult,
				});
			});
		});
	});
});

app.post('/garageItems', checkAuthenticated, (req, res) => {
	const {
		product_id,
		description,
		product_cost,
		retail_price,
		quantity_on_hand,
		category_id,
	} = req.body;
	db.query(
		'INSERT INTO garage_items (product_id, description, product_cost, retail_price, quantity_on_hand, category_id) VALUES (?, ?, ?, ?, ?, ?)',
		[
			product_id,
			description,
			product_cost,
			retail_price,
			quantity_on_hand,
			category_id,
		],
		(err, result) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			req.flash('success', 'Item Added Succefully');
			res.redirect('/garageItems');
		}
	);
});

app.delete('/garageItems/:id', checkAuthenticated, (req, res) => {
	const garageId = req.params.id;
	db.query(
		'DELETE FROM garage_items WHERE id = ?',
		[garageId],
		(err, result) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			if (result.affectedRows === 0) {
				res.sendStatus(404);
				return;
			}
			req.flash('success', 'Item Deleted Succefully');
			res.redirect('/garageItems');
		}
	);
});

//categories

app.get('/categories', checkAuthenticated, (req, res) => {
	db.query('SELECT * FROM categories', (err, result) => {
		if (err) {
			console.log(err);
			res.sendStatus(500);
			return;
		}
		res.render('categories.ejs', { categories: result });
	});
});

app.post('/categories', checkAuthenticated, (req, res) => {
	const { name } = req.body;
	checkCategoryExists(req, name, (err, exists) => {
		if (err) {
			throw err;
		}

		if (exists) {
			req.flash('error', 'Category already exists');
			res.redirect('/categories');
		} else {
			const sql = 'INSERT INTO categories (name) VALUES (?)';
			db.query(sql, [name], (err, result) => {
				if (err) {
					throw err;
				}
				req.flash('success', 'Category Added Succefully');
				res.redirect('/categories');
			});
		}
	});
});

app.delete('/categories/:id', checkAuthenticated, (req, res) => {
	const categoryId = req.params.id;
	db.query(
		'DELETE FROM categories WHERE id = ?',
		[categoryId],
		(err, result) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			if (result.affectedRows === 0) {
				res.sendStatus(404);
				return;
			}
			req.flash('success', 'Category Deleted Succefully');
			res.redirect('/categories');
		}
	);
});
//orders

app.get('/orders', checkAuthenticated, (req, res) => {
	db.query('SELECT * FROM orders', (err, ordersResult) => {
		if (err) {
			console.log(err);
			res.sendStatus(500);
			return;
		}
		db.query('SELECT * FROM customers', (err, customersResult) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			db.query('SELECT * FROM garage_items', (err, itemsResult) => {
				if (err) {
					console.log(err);
					res.sendStatus(500);
					return;
				}
				db.query('SELECT * FROM products', (err, productsResult) => {
					if (err) {
						console.log(err);
						res.sendStatus(500);
						return;
					}
					res.render('orders.ejs', {
						orders: ordersResult,
						customers: customersResult,
						garageItems: itemsResult,
						products: productsResult,
					});
				});
			});
		});
	});
});

app.post('/orders', checkAuthenticated, (req, res) => {
	const { customer_id, garage_item_id, order_date, order_type, quantity } =
	req.body;
	const checkQtySql = 'SELECT quantity_on_hand FROM garage_items WHERE id = ?';
	const sql =
		'INSERT INTO orders (customer_id, order_date, order_type, garage_item_id, quantity) VALUES (?, ?, ?, ?, ?)';
	const updateSqlSell =
		'UPDATE garage_items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?';
	const updateSqlBuy =
		'UPDATE garage_items SET quantity_on_hand = quantity_on_hand + ? WHERE id = ?';
	db.query(checkQtySql, [garage_item_id], (checkErr, checkResult) => {
		if (checkErr) {
			throw checkErr;
		}
		const quantity_on_hand = checkResult[0].quantity_on_hand;
		if (order_type === 'sell' && quantity > quantity_on_hand) {
			req.flash('error', 'Quantity requested exceeds quantity on hand');
			res.redirect('/orders');
		} else {
			const updateSql = order_type === 'sell' ? updateSqlSell : updateSqlBuy;
			const customerId = order_type === 'buy' ? null : customer_id;
			db.query(
				sql,
				[customerId, order_date, order_type, garage_item_id, quantity],
				(err, result) => {
					if (err) {
						throw err;
					}
					db.query(
						updateSql,
						[quantity, garage_item_id],
						(updateErr, updateResult) => {
							if (updateErr) {
								throw updateErr;
							}
							req.flash('success', 'Order Added Successfully');
							res.redirect('/orders');
						}
					);
				}
			);
		}
	});
});


app.delete('/orders/:id', checkAuthenticated, (req, res) => {
	const orderId = req.params.id;
	db.query('SELECT * FROM orders WHERE id = ?', [orderId], (err, result) => {
		if (err) {
			console.log(err);
			res.sendStatus(500);
			return;
		}
		if (result.length === 0) {
			res.sendStatus(404);
			return;
		}

		const order = result[0];
		const qty = order.quantity;
		const garageItemId = order.garage_item_id;
		const orderType = order.order_type;

		db.query('DELETE FROM orders WHERE id = ?', [orderId], (err, result) => {
			if (err) {
				console.log(err);
				res.sendStatus(500);
				return;
			}
			if (result.affectedRows === 0) {
				res.sendStatus(404);
				return;
			}

			if (orderType === 'sell') {
				// add the removed qty to the garageitems qty on hand
				db.query(
					'UPDATE garage_items SET quantity_on_hand = quantity_on_hand + ? WHERE id = ?',
					[qty, garageItemId],
					(err, result) => {
						if (err) {
							console.log(err);
							res.sendStatus(500);
							return;
						}

						req.flash('success', 'Order Deleted Successfully');
						res.redirect('/orders');
					}
				);
			} else if (orderType === 'buy') {
				// remove the added qty from the garageitems qty on hand
				db.query(
					'UPDATE garage_items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?',
					[qty, garageItemId],
					(err, result) => {
						if (err) {
							console.log(err);
							res.sendStatus(500);
							return;
						}

						req.flash('success', 'Order Deleted Successfully');
						res.redirect('/orders');
					}
				);
			} else {
				// handle invalid order type
				res.sendStatus(400);
			}
		});
	});
});

app.get('/monthly_profit_cost', checkAuthenticated, (req, res) => {
	db.query('SELECT * FROM monthly_profit_cost', (err, result) => {
		if (err) {
			console.log(err);
			res.sendStatus(500);
			return;
		}
		res.render('revenues.ejs', { monthly_profit_cost: result });
	});
});

app.all('*', (req, res, next) => {
	next(new ExpressError('Page Not Found', 400));
});

app.use((err, req, res, next) => {
	const { status = 500 } = err;
	if (!err.message) err.message = 'Oh No, Something Went Wrong!';
	res.status(status).render('error', { err });
});

function checkAuthenticated(req, res, next) {
	if (req.isAuthenticated()) {
		return next();
	}

	res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
	if (req.isAuthenticated()) {
		return res.redirect('/');
	}
	next();
}

function checkEmailExists(req, email, callback) {
	const sql = 'SELECT * FROM customers WHERE email = ?';
	db.query(sql, email, (err, result) => {
		if (err) {
			callback(err, null);
		} else {
			callback(null, result.length > 0);
		}
	});
}
function checkCategoryExists(req, name, callback) {
	const sql = 'SELECT * FROM categories WHERE name = ?';
	db.query(sql, name, (err, result) => {
		if (err) {
			callback(err, null);
		} else {
			callback(null, result.length > 0);
		}
	});
}

const port = 5000;
app.listen(port, () => {
	console.log(`Example app listening at http://localhost:${port}`);
});
