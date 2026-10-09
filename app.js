/* =========================================================
   CLICKERLABSTORE CART
   ========================================================= */


/* =========================
   SETTINGS
========================= */

const CART_STORAGE_KEY = "clickerlab_cart";


/* =========================
   CART STATE
========================= */

let cart = loadCart();
let checkoutBusy = false;
let shippingQuote = null;
let shippingBusy = false;


// Inventory is advisory; stock is refreshed before every cart increase.
let inventoryStock = null;
let baseStock = null;
const PRODUCT_BASES = {
    "1-key-clicker": 1, "1-key-light-up-clicker": 1,
    "2-key-clicker": 2, "3-key-clicker": 3, "4-key-clicker": 4, "9-key-clicker": 9
};
const BUNDLE_BASES = {'starter-pack':[1,4], 'starter-lab':[2,4], 'clicker-trio':[1,2,4], 'trio-lab':[1,3,4], 'clickerlab-pack':[1,2,3,4,9]};
function itemClickers(item) {
    return item.options?.clickers || [{productId:item.productId,...item.options}];
}
let inventoryQueue = Promise.resolve();

function notifyInventoryChange() {
    window.dispatchEvent(new Event("clickerlab-inventory-change"));
}

async function refreshInventory() {
    try {
        const response = await fetch("/api/keycaps", {
            cache: "no-store",
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error("Inventory request failed");
        const data = await response.json();
        if (!Array.isArray(data.keycaps)) throw new Error("Invalid inventory");
        const stock = {};
        for (const row of data.keycaps) {
            if (!Number.isInteger(row.id) || row.id < 1 || row.id > 11 ||
                !Number.isInteger(row.stock) || row.stock < 0 || row.id in stock) {
                throw new Error("Invalid inventory row");
            }
            stock[row.id] = row.stock;
        }
        if (Object.keys(stock).length !== 11) throw new Error("Incomplete inventory");
        const bases = {};
        if (!Array.isArray(data.bases)) throw new Error("Missing base inventory");
        for (const row of data.bases) {
            if (!Number.isInteger(row.id) || ![1,2,3,4,9].includes(row.id) ||
                !Number.isInteger(row.stock) || row.stock < 0 || row.id in bases) {
                throw new Error("Invalid base inventory");
            }
            bases[row.id] = row.stock;
        }
        if (![1,2,3,4].every(id => id in bases)) throw new Error("Incomplete base inventory");
        baseStock = bases;
        inventoryStock = stock;
        notifyInventoryChange();
        return stock;
    } catch (error) {
        inventoryStock = null;
        baseStock = null;
        notifyInventoryChange();
        throw error;
    }
}

function availableKeycapStock(id) {
    if (!inventoryStock) return 0;
    const used = cart.reduce((total, item) => total +
        itemClickers(item).reduce((n,c)=>n+(c.keycaps || []).filter(keycap=>Number(keycap)===Number(id)).length,0) *
        Number(item.quantity), 0);
    return Math.max(0, inventoryStock[id] - used);
}

function availableBaseStock(productId) {
    const id = PRODUCT_BASES[productId];
    if (!baseStock || !id) return 0;
    const used = cart.reduce((total,item) => total +
        itemClickers(item).filter(c=>PRODUCT_BASES[c.productId]===id).length * Number(item.quantity),0);
    return Math.max(0,(baseStock[id] || 0)-used);
}

function queueInventoryAddition(item, commit) {
    const operation = inventoryQueue.then(async () => {
        await refreshInventory();
        // Include changes saved in another tab while the request was in flight.
        cart = loadCart();
        const requirements = {};
        const clickers = itemClickers(item);
        const expected = BUNDLE_BASES[item.productId];
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
            (expected && (clickers.length !== expected.length || clickers.some((c,i)=>c.productId !== `${expected[i]}-key-clicker`)))) {
            throw new Error("Please check your bundle selections and quantity.");
        }
        const bases = {};
        for (const clicker of clickers) {
            const base = PRODUCT_BASES[clicker.productId];
            if (!base || !Array.isArray(clicker.keycaps) || clicker.keycaps.length !== base) throw new Error("Choose every keycap first.");
            bases[base] = (bases[base] || 0)+1;
            for (const id of clicker.keycaps) {
                if (!Number.isInteger(id) || !(id in inventoryStock)) throw new Error("Please choose a valid keycap.");
                requirements[id] = (requirements[id] || 0)+1;
            }
        }
        for (const [base,count] of Object.entries(bases)) {
            if (count*item.quantity > availableBaseStock(`${base}-key-clicker`)) throw new Error("Not enough clicker bases. Please reduce the quantity.");
        }
        for (const [id, count] of Object.entries(requirements)) {
            if (count * item.quantity > availableKeycapStock(id)) {
                throw new Error("Not enough stock for Keycap " + id + ". Please reduce the quantity or change keycaps.");
            }
        }
        commit();
        notifyInventoryChange();
        return true;
    });
    inventoryQueue = operation.catch(() => {});
    return operation.catch(error => {
        notifyInventoryChange();
        alert(inventoryStock ? error.message : "Unable to check inventory. Please try again before adding items.");
        return false;
    });
}

window.ClickerInventory = {
    refresh: refreshInventory,
    available: availableKeycapStock,
    availableBase: availableBaseStock,
    ready: () => inventoryStock !== null
};

window.addEventListener("storage", event => {
    if (event.key === CART_STORAGE_KEY || event.key === null) {
        cart = loadCart();
        renderCart();
        notifyInventoryChange();
    }
});

/* =========================
   LOAD CART
========================= */

function loadCart() {

    try {

        const savedCart =
            localStorage.getItem(
                CART_STORAGE_KEY
            );

        if (!savedCart) {
            return [];
        }

        const parsedCart =
            JSON.parse(savedCart);

        if (!Array.isArray(parsedCart)) {
            return [];
        }

        return parsedCart;

    }

    catch (error) {

        console.error(
            "Could not load cart:",
            error
        );

        return [];

    }

}


/* =========================
   SAVE CART
========================= */

function saveCart() {

    localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart)
    );

    renderCart();
    notifyInventoryChange();

}


/* =========================
   CREATE CART DRAWER
========================= */

function createCartDrawer() {

    if (
        document.getElementById(
            "clickerlab-cart-drawer"
        )
    ) {
        return;
    }


    /* CART STYLES */

    const style =
        document.createElement(
            "style"
        );

    style.textContent = `

        /* =========================
           CART BADGE
        ========================== */

        .clicker-cart-button-wrapper {
            position: relative;
        }

        .clicker-cart-count {
            position: absolute;

            top: 3px;
            right: 1px;

            min-width: 22px;
            height: 22px;

            padding: 0 6px;

            display: flex;
            align-items: center;
            justify-content: center;

            border-radius: 999px;

            background: #111111;

            color: #ffffff;

            font-size: 11px;
            font-weight: 800;

            line-height: 1;

            pointer-events: none;
        }

        .clicker-cart-count.hidden {
            display: none;
        }


        /* =========================
           OVERLAY
        ========================== */

        .clicker-cart-overlay {
            position: fixed;

            inset: 0;

            z-index: 9998;

            background:
                rgba(0, 0, 0, 0.32);

            opacity: 0;

            visibility: hidden;

            transition:
                opacity 0.25s ease,
                visibility 0.25s ease;
        }

        .clicker-cart-overlay.open {
            opacity: 1;

            visibility: visible;
        }


        /* =========================
           CART DRAWER
        ========================== */

        .clicker-cart-drawer {
            position: fixed;

            top: 0;
            right: 0;

            z-index: 9999;

            width: min(430px, 100%);

            height: 100%;

            display: flex;
            flex-direction: column;

            background: #ffffff;

            box-shadow:
                -15px 0 40px
                rgba(0, 0, 0, 0.14);

            transform:
                translateX(100%);

            transition:
                transform 0.28s ease;
        }

        .clicker-cart-drawer.open {
            transform:
                translateX(0);
        }


        /* =========================
           HEADER
        ========================== */

        .clicker-cart-header {
            min-height: 83px;

            display: flex;
            align-items: center;
            justify-content: space-between;

            padding:
                20px 22px;

            border-bottom:
                1px solid #eee7dc;
        }

        .clicker-cart-title {
            color: #111111;

            font-size: 25px;
            font-weight: 900;
        }

        .clicker-cart-close {
            width: 42px;
            height: 42px;

            display: flex;
            align-items: center;
            justify-content: center;

            border: none;

            border-radius: 50%;

            background: #faf7f2;

            color: #111111;

            font-family: inherit;

            font-size: 24px;

            cursor: pointer;
        }

        .clicker-cart-close:hover {
            background: #f3eadf;
        }


        /* =========================
           CART ITEMS
        ========================== */

        .clicker-cart-items {
            flex: 1;

            overflow-y: auto;

            padding:
                18px 20px;
        }


        /* =========================
           EMPTY CART
        ========================== */

        .clicker-cart-empty {
            min-height: 300px;

            display: flex;
            flex-direction: column;

            align-items: center;
            justify-content: center;

            padding: 30px;

            text-align: center;
        }

        .clicker-cart-empty-icon {
            width: 70px;
            height: 70px;

            display: flex;
            align-items: center;
            justify-content: center;

            margin-bottom: 18px;

            border-radius: 50%;

            background: #f7e7d1;

            font-size: 30px;
        }

        .clicker-cart-empty h3 {
            margin-bottom: 7px;

            color: #111111;

            font-size: 21px;
            font-weight: 900;
        }

        .clicker-cart-empty p {
            max-width: 260px;

            color: #666666;

            font-size: 14px;
            line-height: 1.5;
        }


        /* =========================
           ITEM
        ========================== */

        .clicker-cart-item {
            display: grid;

            grid-template-columns:
                95px 1fr;

            gap: 15px;

            padding:
                0 0 20px;

            margin-bottom: 20px;

            border-bottom:
                1px solid #eee7dc;
        }

        .clicker-cart-item-image {
            width: 95px;
            height: 95px;

            overflow: hidden;

            border-radius: 13px;

            background: #faf7f2;
        }

        .clicker-cart-item-image img {
            width: 100%;
            height: 100%;

            display: block;

            object-fit: cover;
            object-position: center;
        }

        .clicker-cart-item-main {
            min-width: 0;
        }

        .clicker-cart-item-top {
            display: flex;

            justify-content: space-between;

            gap: 12px;

            margin-bottom: 4px;
        }

        .clicker-cart-item-name {
            color: #111111;

            font-size: 16px;
            font-weight: 900;
        }

        .clicker-cart-item-price {
            flex-shrink: 0;

            color: #111111;

            font-size: 15px;
            font-weight: 900;
        }


        /* =========================
           OPTIONS
        ========================== */

        .clicker-cart-options {
            margin-bottom: 10px;

            color: #666666;

            font-size: 12px;
            line-height: 1.55;
        }

        .clicker-cart-option-line {
            display: block;
        }


        /* =========================
           QUANTITY
        ========================== */

        .clicker-cart-bottom {
            display: flex;

            align-items: center;
            justify-content: space-between;

            gap: 10px;
        }

        .clicker-cart-quantity {
            display: flex;
            align-items: center;

            overflow: hidden;

            border:
                1px solid #ddd6cc;

            border-radius: 9px;
        }

        .clicker-cart-quantity button {
            width: 33px;
            height: 33px;

            border: none;

            background: #ffffff;

            color: #111111;

            font-family: inherit;

            font-size: 18px;

            cursor: pointer;
        }

        .clicker-cart-quantity button:hover {
            background: #faf7f2;
        }

        .clicker-cart-quantity span {
            min-width: 31px;

            text-align: center;

            color: #111111;

            font-size: 13px;
            font-weight: 800;
        }


        /* =========================
           REMOVE
        ========================== */

        .clicker-cart-remove {
            padding: 5px;

            border: none;

            background: transparent;

            color: #777777;

            font-family: inherit;

            font-size: 12px;
            font-weight: 700;

            text-decoration: underline;

            cursor: pointer;
        }

        .clicker-cart-remove:hover {
            color: #111111;
        }


        /* =========================
           FOOTER
        ========================== */

        .clicker-cart-footer {
            padding:
                20px 22px 24px;

            border-top:
                1px solid #eee7dc;

            background: #ffffff;
        }

        .clicker-cart-subtotal {
            display: flex;

            align-items: center;
            justify-content: space-between;

            margin-bottom: 7px;

            color: #111111;

            font-size: 18px;
            font-weight: 900;
        }

        .clicker-cart-note {
            margin-bottom: 17px;

            color: #777777;

            font-size: 12px;
            line-height: 1.5;
        }

        .clicker-shipping-form { margin-bottom: 14px; font-size: 12px; }
        .clicker-shipping-form label { display: block; margin: 6px 0; }
        .clicker-shipping-form [hidden] { display: none !important; }
        .clicker-shipping-form input, .clicker-shipping-form select {
            display: block; width: 100%; box-sizing: border-box; padding: 7px;
            border: 1px solid #d8dde5; border-radius: 6px; font: inherit;
        }
        .clicker-shipping-row { display: flex; gap: 8px; }
        .clicker-shipping-row label { flex: 1; }
        .clicker-shipping-form button { padding: 8px; cursor: pointer; }
        .clicker-cart-footer { max-height: 65vh; overflow-y: auto; }

        .clicker-cart-checkout {
            width: 100%;

            min-height: 53px;

            display: flex;

            align-items: center;
            justify-content: center;

            border: none;

            border-radius: 12px;

            background: #111111;

            color: #ffffff;

            font-family: inherit;

            font-size: 16px;
            font-weight: 900;

            cursor: pointer;
        }

        .clicker-cart-checkout:hover {
            opacity: 0.9;
        }

        .clicker-cart-checkout:disabled {
            background: #c6c6c6;

            cursor: not-allowed;
        }


        /* =========================
           MOBILE
        ========================== */

        @media (max-width: 500px) {

            .clicker-cart-drawer {
                width: 100%;
            }

            .clicker-cart-item {
                grid-template-columns:
                    82px 1fr;
            }

            .clicker-cart-item-image {
                width: 82px;
                height: 82px;
            }

        }

    `;


    document.head.appendChild(
        style
    );


    /* OVERLAY */

    const overlay =
        document.createElement(
            "div"
        );

    overlay.className =
        "clicker-cart-overlay";

    overlay.id =
        "clicker-cart-overlay";


    /* DRAWER */

    const drawer =
        document.createElement(
            "aside"
        );

    drawer.className =
        "clicker-cart-drawer";

    drawer.id =
        "clickerlab-cart-drawer";

    drawer.setAttribute(
        "aria-label",
        "Shopping cart"
    );


    drawer.innerHTML = `

        <div class="clicker-cart-header">

            <div class="clicker-cart-title">
                Your Cart
            </div>

            <button
                type="button"
                class="clicker-cart-close"
                id="clicker-cart-close"
                aria-label="Close cart"
            >
                ×
            </button>

        </div>


        <div
            class="clicker-cart-items"
            id="clicker-cart-items"
        ></div>


        <div class="clicker-cart-footer">

            <div class="clicker-cart-subtotal">

                <span>
                    Subtotal
                </span>

                <span id="clicker-cart-subtotal">
                    $0.00
                </span>

            </div>


            <p class="clicker-cart-note">
                Shipping and taxes will be calculated at checkout.
            </p>


            <form id="clicker-shipping-form" class="clicker-shipping-form">
                <strong>USPS shipping</strong>
                <label>Full name<input name="name" autocomplete="shipping name" required maxlength="150"></label>
                <label>Street address<input name="street1" autocomplete="shipping address-line1" required maxlength="150"></label>
                <label>Apt / unit (optional)<input name="street2" autocomplete="shipping address-line2" maxlength="150"></label>
                <label>City<input name="city" autocomplete="shipping address-level2" required maxlength="150"></label>
                <div class="clicker-shipping-row">
                    <label>State<input name="state" autocomplete="shipping address-level1" required minlength="2" maxlength="2" placeholder="CA"></label>
                    <label>ZIP code<input name="zip" autocomplete="shipping postal-code" required pattern="[0-9]{5}(-[0-9]{4})?" maxlength="10"></label>
                </div>
                <button type="submit" id="clicker-get-shipping">Calculate shipping</button>
                <p id="clicker-shipping-status" role="status" aria-live="polite">Enter your US delivery address to get a rate.</p>
                <label id="clicker-shipping-choice" hidden>Shipping service<select id="clicker-shipping-rate"></select></label>
            </form>

            <button
                type="button"
                class="clicker-cart-checkout"
                id="clicker-cart-checkout"
                disabled
            >
                Checkout
            </button>

        </div>

    `;


    document.body.appendChild(
        overlay
    );

    document.body.appendChild(
        drawer
    );


    document.getElementById("clicker-cart-checkout").addEventListener("click", startCheckout);
    const shippingForm = document.getElementById("clicker-shipping-form");
    shippingForm.addEventListener("submit", calculateShipping);
    shippingForm.addEventListener("input", event => {
        if(event.target.tagName === "INPUT") {
            shippingQuote = null;
            try { sessionStorage.removeItem("clickerlab_shipping_quote"); } catch {}
            document.getElementById("clicker-shipping-choice").hidden = true;
            document.getElementById("clicker-shipping-status").textContent = "Address changed. Calculate shipping again.";
        }
    });

    try {
        const saved = JSON.parse(sessionStorage.getItem("clickerlab_shipping_quote"));
        if(saved) {
            for(const [name,value] of Object.entries(saved.address)) {
                if(shippingForm.elements[name]) shippingForm.elements[name].value = value;
            }
            showShippingQuote(saved.result,saved.expires);
        }
    } catch {}

    /* CLOSE BUTTON */

    document
        .getElementById(
            "clicker-cart-close"
        )
        .addEventListener(
            "click",
            closeCart
        );


    /* CLICK OVERLAY */

    overlay.addEventListener(
        "click",
        closeCart
    );


    /* ESCAPE */

    document.addEventListener(
        "keydown",
        function(event) {

            if (
                event.key === "Escape"
            ) {

                closeCart();

            }

        }
    );


    setupCartButton();

}


/* =========================
   CART NAV BUTTON
========================= */

function setupCartButton() {

    const cartButton =
        document.getElementById(
            "cart-button"
        );

    if (!cartButton) {
        return;
    }


    if (
        cartButton.dataset.cartReady ===
        "true"
    ) {
        return;
    }


    cartButton.dataset.cartReady =
        "true";


    /* WRAPPER FOR BADGE */

    const parent =
        cartButton.parentElement;


    if (
        parent &&
        !cartButton.closest(
            ".clicker-cart-button-wrapper"
        )
    ) {

        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "clicker-cart-button-wrapper";


        parent.insertBefore(
            wrapper,
            cartButton
        );


        wrapper.appendChild(
            cartButton
        );


        const badge =
            document.createElement(
                "span"
            );

        badge.id =
            "clicker-cart-count";

        badge.className =
            "clicker-cart-count hidden";

        badge.textContent =
            "0";


        wrapper.appendChild(
            badge
        );

    }


    cartButton.addEventListener(
        "click",
        openCart
    );

}


/* =========================
   OPEN CART
========================= */

function openCart() {

    const drawer =
        document.getElementById(
            "clickerlab-cart-drawer"
        );

    const overlay =
        document.getElementById(
            "clicker-cart-overlay"
        );


    if (!drawer || !overlay) {
        return;
    }


    drawer.classList.add(
        "open"
    );

    overlay.classList.add(
        "open"
    );


    document.body.style.overflow =
        "hidden";

}


/* =========================
   CLOSE CART
========================= */

function closeCart() {

    const drawer =
        document.getElementById(
            "clickerlab-cart-drawer"
        );

    const overlay =
        document.getElementById(
            "clicker-cart-overlay"
        );


    if (!drawer || !overlay) {
        return;
    }


    drawer.classList.remove(
        "open"
    );

    overlay.classList.remove(
        "open"
    );


    document.body.style.overflow =
        "";

}


/* =========================
   CREATE ITEM KEY
========================= */

function createCartItemKey(item) {

    const options =
        item.options || {};


    return JSON.stringify({

        productId:
            item.productId,

        switchType:
            options.switchType || "",

        keycaps:
            options.keycaps || [],

        clickers: options.clickers || null,

        lightColor:
            options.lightColor || ""

    });

}


/* =========================
   ADD ITEM
========================= */

function addItemToCart(item) {
    return queueInventoryAddition(item, () => commitItemToCart(item));
}

function commitItemToCart(item) {

    if (!item) {
        return;
    }


    const safeQuantity =
        Math.max(
            1,
            parseInt(
                item.quantity,
                10
            ) || 1
        );


    const safeItem = {

        productId:
            String(
                item.productId ||
                ""
            ),

        name:
            String(
                item.name ||
                "Clicker"
            ),

        price:
            Number(
                item.price ||
                0
            ),

        image:
            String(
                item.image ||
                ""
            ),

        quantity:
            safeQuantity,

        maxQuantity:
            Number.isFinite(
                Number(
                    item.maxQuantity
                )
            )
            ?
            Math.max(
                1,
                Number(
                    item.maxQuantity
                )
            )
            :
            99,

        options:
            item.options || {}

    };


    const itemKey =
        createCartItemKey(
            safeItem
        );


    const existingIndex =
        cart.findIndex(
            function(cartItem) {

                return (
                    createCartItemKey(
                        cartItem
                    ) ===
                    itemKey
                );

            }
        );


    if (
        existingIndex !== -1
    ) {

        const existingItem =
            cart[
                existingIndex
            ];


        existingItem.maxQuantity =
            safeItem.maxQuantity;


        existingItem.quantity =
            existingItem.quantity + safeItem.quantity;

    }

    else {

        safeItem.cartId =
            Date.now().toString() +
            "-" +
            Math.random()
                .toString(36)
                .slice(2);


        cart.push(
            safeItem
        );

    }


    saveCart();

    openCart();

}


/* =========================
   REMOVE ITEM
========================= */

function removeCartItem(
    cartId
) {

    cart =
        cart.filter(
            function(item) {

                return (
                    item.cartId !==
                    cartId
                );

            }
        );


    saveCart();

}


/* =========================
   CHANGE QUANTITY
========================= */

function changeCartQuantity(
    cartId,
    change
) {

    const item =
        cart.find(
            function(cartItem) {

                return (
                    cartItem.cartId ===
                    cartId
                );

            }
        );


    if (!item) {
        return;
    }


    if (change > 0) {
        return queueInventoryAddition({ ...item, quantity: change }, () => {
            const current = cart.find(cartItem => cartItem.cartId === cartId);
            if (current) {
                current.quantity += change;
                saveCart();
            }
        });
    }


    const newQuantity =
        item.quantity +
        change;


    if (
        newQuantity < 1
    ) {

        removeCartItem(
            cartId
        );

        return;

    }


    item.quantity =
        newQuantity;


    saveCart();

}


/* =========================
   CART TOTAL
========================= */

function getCartSubtotal() {

    return cart.reduce(
        function(total, item) {

            return (
                total +
                (
                    Number(
                        item.price
                    ) *
                    Number(
                        item.quantity
                    )
                )
            );

        },
        0
    );

}


/* =========================
   CART COUNT
========================= */

function getCartCount() {

    return cart.reduce(
        function(total, item) {

            return (
                total +
                Number(
                    item.quantity
                )
            );

        },
        0
    );

}


/* =========================
   ESCAPE HTML
========================= */

function escapeCartHTML(
    value
) {

    return String(
        value
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================
   OPTION HTML
========================= */

function getCartOptionsHTML(
    item
) {

    const options =
        item.options || {};


    let html = "";


    if (
        options.switchType
    ) {

        html += `

            <span class="clicker-cart-option-line">

                Switch:
                ${escapeCartHTML(
                    options.switchType
                )}

            </span>

        `;

    }


    if (
        options.lightColor
    ) {

        html += `

            <span class="clicker-cart-option-line">

                Light:
                ${escapeCartHTML(
                    options.lightColor
                )}

            </span>

        `;

    }


    if (
        Array.isArray(
            options.keycaps
        ) &&
        options.keycaps.length
    ) {

        html += `

            <span class="clicker-cart-option-line">

                Keycaps:
                ${options.keycaps
                    .map(
                        function(keycap) {

                            return (
                                "#" +
                                escapeCartHTML(
                                    keycap
                                )
                            );

                        }
                    )
                    .join(", ")}

            </span>

        `;

    }


    if (Array.isArray(options.clickers)) {
        html += options.clickers.map(c => `<span class="clicker-cart-option-line">${escapeCartHTML(c.productId.replace('-key-clicker','-Key Clicker'))}: ${escapeCartHTML(c.switchType)}; Keycaps: ${(c.keycaps || []).map(id=>'#'+escapeCartHTML(id)).join(', ')}</span>`).join('');
    }

    return html;

}


/* =========================
   RENDER CART
========================= */

function renderCart() {

    const itemsContainer =
        document.getElementById(
            "clicker-cart-items"
        );

    const subtotalElement =
        document.getElementById(
            "clicker-cart-subtotal"
        );

    const checkoutButton =
        document.getElementById(
            "clicker-cart-checkout"
        );

    const countBadge =
        document.getElementById(
            "clicker-cart-count"
        );


    /* BADGE */

    if (countBadge) {

        const count =
            getCartCount();


        countBadge.textContent =
            count;


        if (
            count > 0
        ) {

            countBadge.classList.remove(
                "hidden"
            );

        }

        else {

            countBadge.classList.add(
                "hidden"
            );

        }

    }


    if (
        !itemsContainer ||
        !subtotalElement
    ) {
        return;
    }


    /* EMPTY CART */

    if (
        cart.length === 0
    ) {

        itemsContainer.innerHTML = `

            <div class="clicker-cart-empty">

                <div class="clicker-cart-empty-icon">
                    🛒
                </div>

                <h3>
                    Your cart is empty
                </h3>

                <p>
                    Add a clicker and it will appear here.
                </p>

            </div>

        `;


        subtotalElement.textContent =
            "$0.00";


        if (
            checkoutButton
        ) {

            checkoutButton.disabled =
                true;

        }


        return;

    }


    /* ITEMS */

    itemsContainer.innerHTML =
        cart
            .map(
                function(item) {

                    const linePrice =
                        Number(
                            item.price
                        ) *
                        Number(
                            item.quantity
                        );


                    const imageHTML =
                        item.image
                        ?
                        `

                            <img
                                src="${escapeCartHTML(
                                    item.image
                                )}"
                                alt="${escapeCartHTML(
                                    item.name
                                )}"
                            >

                        `
                        :
                        "";


                    return `

                        <div
                            class="clicker-cart-item"
                            data-cart-id="${escapeCartHTML(
                                item.cartId
                            )}"
                        >

                            <div class="clicker-cart-item-image">

                                ${imageHTML}

                            </div>


                            <div class="clicker-cart-item-main">


                                <div class="clicker-cart-item-top">

                                    <div class="clicker-cart-item-name">

                                        ${escapeCartHTML(
                                            item.name
                                        )}

                                    </div>


                                    <div class="clicker-cart-item-price">

                                        $${linePrice.toFixed(2)}

                                    </div>

                                </div>


                                <div class="clicker-cart-options">

                                    ${getCartOptionsHTML(
                                        item
                                    )}

                                </div>


                                <div class="clicker-cart-bottom">


                                    <div class="clicker-cart-quantity">

                                        <button
                                            type="button"
                                            data-action="decrease"
                                            data-cart-id="${escapeCartHTML(
                                                item.cartId
                                            )}"
                                            aria-label="Decrease quantity"
                                        >
                                            −
                                        </button>


                                        <span>
                                            ${item.quantity}
                                        </span>


                                        <button
                                            type="button"
                                            data-action="increase"
                                            data-cart-id="${escapeCartHTML(
                                                item.cartId
                                            )}"
                                            aria-label="Increase quantity"
                                        >
                                            +
                                        </button>

                                    </div>


                                    <button
                                        type="button"
                                        class="clicker-cart-remove"
                                        data-action="remove"
                                        data-cart-id="${escapeCartHTML(
                                            item.cartId
                                        )}"
                                    >
                                        Remove
                                    </button>


                                </div>


                            </div>


                        </div>

                    `;

                }
            )
            .join("");


    subtotalElement.textContent =
        "$" +
        getCartSubtotal()
            .toFixed(2);


    if (
        checkoutButton
    ) {

        checkoutButton.disabled = checkoutBusy;

    }


    /* BUTTON EVENTS */

    itemsContainer
        .querySelectorAll(
            "[data-action]"
        )
        .forEach(
            function(button) {

                button.addEventListener(
                    "click",
                    function() {

                        const action =
                            button.dataset.action;

                        const cartId =
                            button.dataset.cartId;


                        if (
                            action ===
                            "increase"
                        ) {

                            changeCartQuantity(
                                cartId,
                                1
                            );

                        }


                        if (
                            action ===
                            "decrease"
                        ) {

                            changeCartQuantity(
                                cartId,
                                -1
                            );

                        }


                        if (
                            action ===
                            "remove"
                        ) {

                            removeCartItem(
                                cartId
                            );

                        }

                    }
                );

            }
        );

}


function shippingAddressInput() {
    return Object.fromEntries(new FormData(document.getElementById("clicker-shipping-form")));
}

function showShippingQuote(result, expires) {
    const select = document.getElementById("clicker-shipping-rate");
    select.replaceChildren();
    for(const rate of result.rates) {
        const option = document.createElement("option");
        option.value = rate.id;
        option.textContent = rate.service + " — $" + (rate.amount/100).toFixed(2);
        select.appendChild(option);
    }
    shippingQuote = {id:result.quoteId, expires};
    document.getElementById("clicker-shipping-choice").hidden = false;
    document.getElementById("clicker-shipping-status").textContent = "Shipping will be added at Checkout.";
}

async function calculateShipping(event) {
    event.preventDefault();
    if(shippingBusy) return;
    shippingBusy = true;
    shippingQuote = null;
    const button = document.getElementById("clicker-get-shipping");
    const status = document.getElementById("clicker-shipping-status");
    const address = shippingAddressInput();
    button.disabled = true;
    document.getElementById("clicker-shipping-choice").hidden = true;
    status.textContent = "Checking USPS rates…";
    try {
        const response = await fetch("/api/shipping-rates",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({address:{...address,country:"US"}}),signal:AbortSignal.timeout(30000)
        });
        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "Unable to calculate shipping.");
        if(JSON.stringify(address) !== JSON.stringify(shippingAddressInput())) {
            throw new Error("Address changed. Calculate shipping again.");
        }
        const expires = Date.now()+15*60*1000;
        showShippingQuote(result,expires);
        try { sessionStorage.setItem("clickerlab_shipping_quote",JSON.stringify({address,result,expires})); } catch {}
    } catch(error) { status.textContent = error.message; }
    finally { shippingBusy = false; button.disabled = false; }
}

async function startCheckout() {
    if (checkoutBusy || !cart.length) return;
    let previousAttempt;
    try { previousAttempt = JSON.parse(localStorage.getItem("clickerlab_checkout_attempt")); } catch {}
    const selectedRate = document.getElementById("clicker-shipping-rate").value;
    const resuming = previousAttempt?.fingerprint === JSON.stringify(loadCart()) &&
        previousAttempt?.quoteId === shippingQuote?.id && previousAttempt?.rateId === selectedRate;
    if(!shippingQuote || (!resuming && shippingQuote.expires < Date.now())) {
        alert("Please calculate shipping for your delivery address first.");
        return;
    }
    const quoteId = shippingQuote.id;
    const rateId = document.getElementById("clicker-shipping-rate").value;
    checkoutBusy = true;
    const button = document.getElementById("clicker-cart-checkout");
    button.disabled = true;
    button.textContent = "Starting Checkout…";
    try {
        const items = loadCart();
        const fingerprint = JSON.stringify(items);
        let attempt;
        try { attempt = JSON.parse(localStorage.getItem("clickerlab_checkout_attempt")); } catch {}
        if (!attempt || attempt.fingerprint !== fingerprint || attempt.quoteId !== quoteId || attempt.rateId !== rateId) {
            attempt = { fingerprint, quoteId, rateId, id:crypto.randomUUID() };
            localStorage.setItem("clickerlab_checkout_attempt",JSON.stringify(attempt));
        }
        const response = await fetch("/api/checkout", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({items,requestId:attempt.id,quoteId,rateId}), signal:AbortSignal.timeout(30000)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to start Checkout.");
        const target = new URL(result.url);
        if (target.origin !== "https://checkout.stripe.com") throw new Error("Invalid Checkout address.");
        window.location.assign(target.href);
    } catch(error) {
        alert(error.message);
    } finally {
        checkoutBusy = false;
        button.textContent = "Checkout";
        renderCart();
        window.ClickerInventory.refresh().catch(() => {});
    }
}

/* =========================
   PUBLIC CART API
========================= */

window.ClickerCart = {

    addItem:
        addItemToCart,

    open:
        openCart,

    close:
        closeCart,

    getItems:
        function() {

            return cart;

        }

};


/* =========================
   START CART
========================= */

function initializeClickerCart() {

    createCartDrawer();

    renderCart();

}


/* RUN WHEN PAGE IS READY */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeClickerCart
    );

}

else {

    initializeClickerCart();

}

// A return URL alone never proves payment. Confirm the webhook-updated order.
async function checkCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    if(params.get("checkout") !== "success") return;
    const session = params.get("session_id");
    if(!/^cs_test_[A-Za-z0-9]+$/.test(session || "")) return;
    try {
        const response = await fetch("/api/order-status?session_id="+encodeURIComponent(session),{cache:"no-store"});
        if(!response.ok) throw new Error();
        const result = await response.json();
        if(result.status === "paid") {
            let attempt;
            try { attempt = JSON.parse(localStorage.getItem("clickerlab_checkout_attempt")); } catch {}
            if(attempt?.id === result.orderId && attempt?.fingerprint === JSON.stringify(loadCart())) {
                cart = [];
                saveCart();
                localStorage.removeItem("clickerlab_checkout_attempt");
                try { sessionStorage.removeItem("clickerlab_shipping_quote"); } catch {}
            }
            alert("Test payment confirmed. Thank you!");
        } else {
            alert("Your payment confirmation is still processing. Please keep your Stripe receipt.");
        }
    } catch {
        alert("We could not check your payment confirmation. Please keep your Stripe receipt.");
    }
}
if(typeof window.location !== "undefined") checkCheckoutReturn();
