const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');

const token = ''; // Replace with your bot token
const bot = new TelegramBot(token, { polling: true });

const typeOptions = [
  'Cash Sale', 'Cash Purchase',
  'Credit Sale', 'Credit Purchase',
  'Paid to Creditor', 'Received from Debtor'
];

const userSessions = {};

bot.onText(/\/invoice/, (msg) => {
  const chatId = msg.chat.id;
  userSessions[chatId] = {
    step: 'date',
    data: {},
    items: [],
    currentItem: {}
  };
  bot.sendMessage(chatId, '📅 Enter date (YYYY-MM-DD):');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text) return; // ✅ Prevent crash on non-text messages
  const text = msg.text.trim();
  const session = userSessions[chatId];
  if (!session || text.startsWith('/')) return;

  const step = session.step;

  if (step === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return bot.sendMessage(chatId, '❌ Invalid date format. Use YYYY-MM-DD');
    session.data.date = text;
    session.step = 'type';
    return bot.sendMessage(chatId, `📂 Enter type:\n${typeOptions.join('\n')}`);
  }

  if (step === 'type') {
    if (!typeOptions.includes(text)) return bot.sendMessage(chatId, '❌ Invalid type. Choose a valid option.');
    session.data.type = text;
    const isPayment = ['Paid to Creditor', 'Received from Debtor'].includes(text);
    session.step = 'party';
    session.expectingPaymentOnly = isPayment;
    return bot.sendMessage(chatId, '👤 Enter party name:');
  }

  if (step === 'party') {
    session.data.party_name = text;
    if (session.expectingPaymentOnly) {
      session.step = 'amount';
      return bot.sendMessage(chatId, '💵 Enter amount:');
    } else {
      session.step = 'item_name';
      return bot.sendMessage(chatId, '📦 Enter item name:');
    }
  }

  if (step === 'amount') {
    const amount = parseFloat(text);
    if (isNaN(amount)) return bot.sendMessage(chatId, '❌ Invalid amount.');
    session.data.amount_direct = amount;
    return confirmAndSubmit(chatId, session);
  }

  if (step === 'item_name') {
    session.currentItem = { item_name: text };
    session.step = 'quantity';
    return bot.sendMessage(chatId, '🔢 Enter quantity:');
  }

  if (step === 'quantity') {
    const qty = parseFloat(text);
    if (isNaN(qty)) return bot.sendMessage(chatId, '❌ Invalid quantity.');
    session.currentItem.quantity = qty;
    session.step = 'rate';
    return bot.sendMessage(chatId, '💰 Enter rate:');
  }

  if (step === 'rate') {
    const rate = parseFloat(text);
    if (isNaN(rate)) return bot.sendMessage(chatId, '❌ Invalid rate.');
    session.currentItem.rate = rate;
    session.items.push(session.currentItem);
    session.currentItem = {};
    session.step = 'add_more';
    return bot.sendMessage(chatId, '➕ Do you want to add another item? (yes/no)');
  }

  if (step === 'add_more') {
    if (text.toLowerCase() === 'yes') {
      session.step = 'item_name';
      return bot.sendMessage(chatId, '📦 Enter item name:');
    } else if (text.toLowerCase() === 'no') {
      return confirmAndSubmit(chatId, session);
    } else {
      return bot.sendMessage(chatId, '❓ Please reply with "yes" or "no"');
    }
  }

  if (step === 'confirm') {
    if (text.toLowerCase() === 'confirm') {
      await submitInvoice(session.data, session.items, chatId);
      delete userSessions[chatId];
    } else {
      bot.sendMessage(chatId, '❌ Please type "confirm" to submit or restart with /invoice');
    }
  }
});

function confirmAndSubmit(chatId, session) {
  const d = session.data;
  let summary = `✅ Invoice Summary:\n📅 ${d.date}\n📂 ${d.type}\n👤 ${d.party_name}`;
  if (session.expectingPaymentOnly) {
    summary += `\n💵 Amount: ${d.amount_direct}`;
  } else {
    session.items.forEach((item, i) => {
      summary += `\n🛒 Item ${i + 1}: ${item.item_name} | Qty: ${item.quantity} | Rate: ${item.rate}`;
    });
  }
  summary += `\n\nSend "confirm" to submit the invoice.`;
  session.step = 'confirm';
  bot.sendMessage(chatId, summary);
}

// -------------------- SUBMIT INVOICE --------------------
async function submitInvoice(data, items, chatId) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('🖥️ PAGE LOG:', msg.text()));

  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
    await page.type('input[name="username"]', 'Affan');
    await page.type('input[name="password"]', 'affan100');
    await Promise.all([
      page.click('button'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    const typeMap = {
      'Cash Sale': 'cash_sale',
      'Credit Sale': 'credit_sale',
      'Cash Purchase': 'cash_purchase',
      'Credit Purchase': 'credit_purchase',
      'Paid to Creditor': 'make_payment',
      'Received from Debtor': 'receive_payment'
    };

    await page.goto('http://localhost:3000/invoice', { waitUntil: 'networkidle2' });

    await page.evaluate(({ date, type, party, items, amount }) => {
      const trigger = el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const set = (selector, value) => {
        const el = document.querySelector(selector);
        if (el) {
          el.value = value;
          trigger(el);
        }
      };

      set('input[name="date"]', date);
      set('select[name="type"]', type);
      set('input[name="party_name"]', party);

      if (type === 'make_payment' || type === 'receive_payment') {
        set('input[name="amount_direct"]', amount);
      } else {
        for (let i = 1; i < items.length; i++) {
  const buttons = Array.from(document.querySelectorAll('button'));
  const addBtn = buttons.find(btn => btn.innerText.trim() === '➕ Add Item');
  if (addBtn) addBtn.click();
}


        const names = document.querySelectorAll('input[name="item_name[]"]');
        const qtys = document.querySelectorAll('input[name="quantity[]"]');
        const rates = document.querySelectorAll('input[name="rate[]"]');

        items.forEach((item, i) => {
          if (names[i]) names[i].value = item.item_name;
          if (qtys[i]) qtys[i].value = item.quantity;
          if (rates[i]) rates[i].value = item.rate;
          trigger(names[i]);
          trigger(qtys[i]);
          trigger(rates[i]);
        });
      }

    }, {
      date: data.date,
      type: typeMap[data.type],
      party: data.party_name,
      items,
      amount: data.amount_direct || 0
    });

    const fs = require('fs');
const folder = 'screenshots';
if (!fs.existsSync(folder)) fs.mkdirSync(folder);
const screenshot = `${folder}/invoice_${Date.now()}.png`;

    await page.screenshot({ path: screenshot, fullPage: true });

    const clicked = await Promise.all([
      page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => b.innerText.trim() === '💾 Save Invoice');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    if (!clicked[0]) {
      await bot.sendMessage(chatId, '❌ "Save Invoice" button not found.');
      return;
    }

    await bot.sendPhoto(chatId, screenshot, { caption: '✅ Invoice submitted successfully!' });

  } catch (err) {
    console.error('❌ Error:', err.message);
    await bot.sendMessage(chatId, '❌ Failed to submit invoice.');
  } finally {
    await browser.close();
  }
}
// -------------------- SCREENSHOT TAB FUNCTION --------------------
const captureTab = async (url, chatId, caption) => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
    await page.type('input[name="username"]', 'Affan');
    await page.type('input[name="password"]', 'Hania1000');
    await Promise.all([
      page.click('button'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    await page.goto(url, { waitUntil: 'networkidle2' });
    const fs = require('fs');
const folder = 'screenshots';
if (!fs.existsSync(folder)) fs.mkdirSync(folder);
const fileSafe = caption.replace(/[^a-z]/gi, '_');
const path = `${folder}/${fileSafe}_${Date.now()}.png`;

    await page.screenshot({ path, fullPage: true });
    await bot.sendPhoto(chatId, path, { caption });

  } catch (err) {
    console.error('❌ Error in captureTab:', err.message);
    await bot.sendMessage(chatId, '❌ Failed to capture screenshot.');
  } finally {
    await browser.close();
  }
};

// -------------------- TAB COMMANDS --------------------
bot.onText(/\/showinvoice/, (msg) => {
  captureTab('http://localhost:3000/invoice', msg.chat.id, '🧾 Create Invoice');
});
bot.onText(/\/showcash/, (msg) => {
  captureTab('http://localhost:3000/cash', msg.chat.id, '💵 Cash Book');
});
bot.onText(/\/showdebtors/, (msg) => {
  captureTab('http://localhost:3000/debtors', msg.chat.id, '🧮 Debtor & Creditor Balance');
});
bot.onText(/\/showexpense/, (msg) => {
  captureTab('http://localhost:3000/expense', msg.chat.id, '📉 Add Expense');
});
bot.onText(/\/showtracker/, (msg) => {
  captureTab('http://localhost:3000/tracker', msg.chat.id, '🔍 Invoice Tracker');
});
bot.onText(/\/showprofit/, (msg) => {
  captureTab('http://localhost:3000/profit', msg.chat.id, '📊 Profit & Loss');
});
bot.onText(/\/showstock/, (msg) => {
  captureTab('http://localhost:3000/stock', msg.chat.id, '📦 Stock');
});
bot.onText(/\/showaccounts/, (msg) => {
  captureTab('http://localhost:3000/accounts', msg.chat.id, '📒 Accounts');
});
bot.onText(/\/showopeningcash/, (msg) => {
  captureTab('http://localhost:3000/opening-cash', msg.chat.id, '💵 Opening Cash');
});
bot.onText(/\/showopeningstock/, (msg) => {
  captureTab('http://localhost:3000/opening-stock', msg.chat.id, '📥 Opening Stock');
});
console.log('🤖 Bot is running...') ;

