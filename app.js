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


            <button
                type="button"
                class="clicker-cart-checkout"
                id="clicker-cart-checkout"
                disabled
            >
                Checkout Coming Soon
            </button>

        </div>

    `;


    document.body.appendChild(
        overlay
    );

    document.body.appendChild(
        drawer
    );


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

        lightColor:
            options.lightColor || ""

    });

}


/* =========================
   ADD ITEM
========================= */

function addItemToCart(item) {

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
            Math.min(

                existingItem.quantity +
                safeItem.quantity,

                safeItem.maxQuantity

            );

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


    const maxQuantity =
        item.maxQuantity || 99;


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
        Math.min(
            newQuantity,
            maxQuantity
        );


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

        checkoutButton.disabled =
            false;

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
