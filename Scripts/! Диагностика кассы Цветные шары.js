(function () {
    'use strict';

    const PANEL_ID = 'cbdi-panel';
    const STYLE_ID = 'cbdi-style';
    const STORE_KEY = '__coloredBallsCashierInspector';
    const VERSION = '1.0';
    const COLOR_ORDER = [
        { key: 'red', name: 'Красная', numbers: [1, 9, 17, 25, 33, 41] },
        { key: 'green', name: 'Зелёная', numbers: [2, 10, 18, 26, 34, 42] },
        { key: 'blue', name: 'Синяя', numbers: [3, 11, 19, 27, 35, 43] },
        { key: 'purple', name: 'Фиолетовая', numbers: [4, 12, 20, 28, 36, 44] },
        { key: 'brown', name: 'Коричневая', numbers: [5, 13, 21, 29, 37, 45] },
        { key: 'yellow', name: 'Жёлтая', numbers: [6, 14, 22, 30, 38, 46] },
        { key: 'orange', name: 'Оранжевая', numbers: [7, 15, 23, 31, 39, 47] },
        { key: 'black', name: 'Чёрная', numbers: [8, 16, 24, 32, 40, 48] }
    ];

    const oldPanel = document.getElementById(PANEL_ID);
    if (oldPanel) {
        oldPanel.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
    }

    const store = window[STORE_KEY] || {
        version: VERSION,
        createdAt: new Date().toISOString(),
        snapshots: []
    };
    window[STORE_KEY] = store;

    function textOf(element) {
        return element ? String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    function isOwnElement(element) {
        return Boolean(element && element.closest && element.closest('#' + PANEL_ID));
    }

    function isVisible(element) {
        if (!element || isOwnElement(element)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || 1) !== 0
            && rect.width > 0
            && rect.height > 0;
    }

    function classText(element) {
        if (!element) return '';
        return typeof element.className === 'string'
            ? element.className
            : String(element.className && element.className.baseVal || '');
    }

    function safePath() {
        return location.origin + location.pathname;
    }

    function styleSignature(element) {
        if (!element) return {};
        const style = getComputedStyle(element);
        return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage === 'none' ? 'none' : style.backgroundImage.slice(0, 180),
            color: style.color,
            borderColor: style.borderColor,
            borderWidth: style.borderWidth,
            boxShadow: style.boxShadow,
            opacity: style.opacity,
            transform: style.transform
        };
    }

    function selectedAttributes(element) {
        return {
            ariaPressed: element.getAttribute('aria-pressed'),
            ariaSelected: element.getAttribute('aria-selected'),
            ariaChecked: element.getAttribute('aria-checked'),
            dataSelected: element.getAttribute('data-selected'),
            dataState: element.getAttribute('data-state')
        };
    }

    function elementSummary(element, index) {
        const rect = element.getBoundingClientRect();
        return {
            index,
            tag: element.tagName.toLowerCase(),
            id: element.id || null,
            text: textOf(element).slice(0, 160),
            className: classText(element),
            type: element.getAttribute('type'),
            disabled: Boolean(element.disabled || element.hasAttribute('disabled')),
            checked: 'checked' in element ? Boolean(element.checked) : null,
            visible: isVisible(element),
            role: element.getAttribute('role'),
            selectedAttributes: selectedAttributes(element),
            computedStyle: styleSignature(element),
            size: {
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            }
        };
    }

    function histogram(values) {
        const counts = {};
        values.forEach(value => {
            const key = value || '(empty)';
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }

    function dominantValue(counts) {
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    function directNumericButtons(container) {
        return Array.from(container.children).filter(child =>
            child.tagName === 'BUTTON' && /^\d{1,2}$/.test(textOf(child))
        );
    }

    function findNumericGrids() {
        const grids = [];
        document.querySelectorAll('div, ul, section, fieldset').forEach(container => {
            if (!isVisible(container)) return;
            const buttons = directNumericButtons(container);
            const numbers = buttons.map(button => Number(textOf(button)));
            const unique = Array.from(new Set(numbers)).sort((a, b) => a - b);
            if (buttons.length !== 48 || unique.length !== 48 || unique[0] !== 1 || unique[47] !== 48) return;

            const classCounts = histogram(buttons.map(classText));
            const dominantClass = dominantValue(classCounts);
            const additionalContainer = container.closest('[id^="additional-game-"]');
            grids.push({
                context: additionalContainer ? additionalContainer.id : 'main-field-candidate',
                container: {
                    tag: container.tagName.toLowerCase(),
                    id: container.id || null,
                    className: classText(container)
                },
                enabledCount: buttons.filter(button => !button.disabled).length,
                disabledCount: buttons.filter(button => button.disabled).length,
                classHistogram: classCounts,
                dominantClass,
                buttons: buttons.map((button, index) => ({
                    ...elementSummary(button, index),
                    number: Number(textOf(button)),
                    differsFromDominantClass: classText(button) !== dominantClass
                }))
            });
        });
        return grids;
    }

    function additionalGameSummary(container) {
        const clearButton = container.querySelector('.clear-button button');
        const allButtons = Array.from(container.querySelectorAll('button'));
        const choices = allButtons.filter(button => button !== clearButton);
        const classCounts = histogram(choices.map(classText));
        const dominantClass = dominantValue(classCounts);
        return {
            id: container.id,
            title: textOf(container.querySelector('.title')),
            price: textOf(container.querySelector('.price')),
            visible: isVisible(container),
            clearButton: clearButton ? elementSummary(clearButton, 0) : null,
            choiceCount: choices.length,
            enabledChoiceCount: choices.filter(button => !button.disabled).length,
            classHistogram: classCounts,
            dominantClass,
            colorOrderHint: ['additional-game-7', 'additional-game-2'].includes(container.id)
                ? COLOR_ORDER
                : null,
            choices: choices.map((button, index) => ({
                ...elementSummary(button, index),
                differsFromDominantClass: classText(button) !== dominantClass,
                expectedColor: ['additional-game-7', 'additional-game-2'].includes(container.id)
                    ? COLOR_ORDER[index] || null
                    : null
            }))
        };
    }

    function findAdditionalGames() {
        return Array.from(document.querySelectorAll('[id^="additional-game-"]'))
            .filter(container => !isOwnElement(container))
            .map(additionalGameSummary)
            .sort((a, b) => a.id.localeCompare(b.id, 'ru'));
    }

    function ticketTabs() {
        return Array.from(document.querySelectorAll('input[type="radio"]'))
            .filter(input => !isOwnElement(input))
            .map((input, index) => {
                const label = input.closest('label');
                return {
                    index,
                    checked: Boolean(input.checked),
                    disabled: Boolean(input.disabled),
                    inputClassName: classText(input),
                    labelClassName: classText(label),
                    labelText: textOf(label).slice(0, 180),
                    visible: isVisible(input) || isVisible(label)
                };
            });
    }

    function actionButtons() {
        const importantIds = new Set([
            'back-button',
            'button-select-draw',
            'clear',
            'fill',
            'on-add-ticket-click',
            'on-remove-ticket-click',
            'to-add-phone',
            'add-to-cart-button',
            'btn-buy',
            'payment',
            'payment-digit-button',
            'clear-cart'
        ]);
        const textPattern = /автоматически|очистить|печать|далее|добавить|корзин|оплат|назад|телефон/i;
        return Array.from(document.querySelectorAll('button'))
            .filter(button => !isOwnElement(button))
            .filter(button => importantIds.has(button.id) || textPattern.test(textOf(button)))
            .map(elementSummary);
    }

    function duplicateIds() {
        const counts = {};
        document.querySelectorAll('[id]').forEach(element => {
            if (isOwnElement(element)) return;
            counts[element.id] = (counts[element.id] || 0) + 1;
        });
        return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 1));
    }

    function safeInputs() {
        return Array.from(document.querySelectorAll('input, textarea, select'))
            .filter(element => !isOwnElement(element))
            .map((element, index) => ({
                index,
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                className: classText(element),
                type: element.getAttribute('type'),
                name: element.getAttribute('name'),
                placeholder: element.getAttribute('placeholder'),
                disabled: Boolean(element.disabled),
                checked: 'checked' in element ? Boolean(element.checked) : null,
                visible: isVisible(element)
            }));
    }

    function keypadGroups() {
        return Array.from(document.querySelectorAll('[role="group"]'))
            .filter(group => !isOwnElement(group) && isVisible(group))
            .map((group, index) => ({
                index,
                id: group.id || null,
                className: classText(group),
                buttons: Array.from(group.querySelectorAll('button')).map((button, buttonIndex) => ({
                    index: buttonIndex,
                    text: textOf(button).slice(0, 40),
                    id: button.id || null,
                    className: classText(button),
                    disabled: Boolean(button.disabled),
                    visible: isVisible(button)
                }))
            }));
    }

    function statusTexts() {
        const pattern = /^(Шаг\s+\d+\s+из\s+\d+.*|Итого:\s*.*|НЕ ЗАПОЛНЕНО!?|ЗАПОЛНЕНО!?|Билет\s+\d+)$/i;
        const results = [];
        document.querySelectorAll('div, span, p, h1, h2, h3').forEach(element => {
            if (!isVisible(element) || element.children.length) return;
            const text = textOf(element);
            if (text && pattern.test(text)) results.push(text.slice(0, 220));
        });
        return Array.from(new Set(results));
    }

    function collectSnapshot(label) {
        const allButtons = Array.from(document.querySelectorAll('button')).filter(button => !isOwnElement(button));
        return {
            label,
            capturedAt: new Date().toISOString(),
            page: {
                title: document.title,
                safeUrl: safePath(),
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            },
            statusTexts: statusTexts(),
            duplicateIds: duplicateIds(),
            ticketTabs: ticketTabs(),
            numericGrids: findNumericGrids(),
            additionalGames: findAdditionalGames(),
            actionButtons: actionButtons(),
            keypadGroups: keypadGroups(),
            safeInputs: safeInputs(),
            buttonCounts: {
                total: allButtons.length,
                visible: allButtons.filter(isVisible).length,
                enabledVisible: allButtons.filter(button => isVisible(button) && !button.disabled).length,
                disabledVisible: allButtons.filter(button => isVisible(button) && button.disabled).length
            }
        };
    }

    function reportObject() {
        return {
            reportType: 'colored-balls-cashier-dom-diagnostics',
            version: VERSION,
            createdAt: store.createdAt,
            exportedAt: new Date().toISOString(),
            privacy: {
                inputValuesCollected: false,
                cookiesCollected: false,
                localStorageCollected: false,
                networkUploadPerformed: false
            },
            colorOrderReference: COLOR_ORDER,
            snapshots: store.snapshots
        };
    }

    function reportJson() {
        return JSON.stringify(reportObject(), null, 2);
    }

    function downloadReport() {
        if (!store.snapshots.length) takeSnapshot();
        const blob = new Blob([reportJson()], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `colored-balls-cashier-report-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus('Отчёт скачан. Отправьте JSON-файл разработчику.', true);
    }

    async function copyReport() {
        if (!store.snapshots.length) takeSnapshot();
        try {
            await navigator.clipboard.writeText(reportJson());
            setStatus('Отчёт скопирован в буфер обмена.', true);
        } catch (error) {
            setStatus('Буфер недоступен — используйте «Скачать JSON».', false);
        }
    }

    function setStatus(message, success) {
        const status = document.getElementById('cbdi-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.success = success ? '1' : '0';
    }

    function updateCounter() {
        const counter = document.getElementById('cbdi-counter');
        if (counter) counter.textContent = `Снимков: ${store.snapshots.length}`;
    }

    function takeSnapshot() {
        const input = document.getElementById('cbdi-label');
        const fallback = `Снимок ${store.snapshots.length + 1}`;
        const label = String(input?.value || '').trim() || fallback;
        try {
            store.snapshots.push(collectSnapshot(label));
            if (input) input.value = `Снимок ${store.snapshots.length + 1}`;
            updateCounter();
            setStatus(`Сохранён: ${label}`, true);
        } catch (error) {
            console.error('[Colored Balls diagnostics]', error);
            setStatus(`Ошибка снимка: ${error.message}`, false);
        }
    }

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(390px,calc(100vw - 32px));box-sizing:border-box;padding:14px;border:2px solid #39a0ff;border-radius:14px;background:#111827;color:#f8fafc;box-shadow:0 18px 60px rgba(0,0,0,.45);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
            #${PANEL_ID} *{box-sizing:border-box}
            #${PANEL_ID} .cbdi-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}
            #${PANEL_ID} .cbdi-title{font-size:15px;font-weight:800;color:#7dd3fc}
            #${PANEL_ID} .cbdi-note{margin-top:3px;color:#cbd5e1;font-size:11px}
            #${PANEL_ID} .cbdi-close{border:0;background:transparent;color:#fda4af;font-size:20px;line-height:1;cursor:pointer}
            #${PANEL_ID} input{width:100%;padding:8px 9px;border:1px solid #475569;border-radius:8px;background:#0f172a;color:#fff;font:inherit}
            #${PANEL_ID} .cbdi-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
            #${PANEL_ID} button.cbdi-btn{min-height:36px;padding:8px;border:0;border-radius:8px;background:#2563eb;color:#fff;font:700 12px system-ui;cursor:pointer}
            #${PANEL_ID} button.cbdi-btn.secondary{background:#475569}
            #${PANEL_ID} button.cbdi-btn.danger{background:#9f1239}
            #${PANEL_ID} #cbdi-status{margin-top:9px;padding:8px;border-radius:8px;background:#1e293b;color:#fda4af;min-height:34px}
            #${PANEL_ID} #cbdi-status[data-success="1"]{color:#86efac}
            #${PANEL_ID} .cbdi-foot{display:flex;justify-content:space-between;gap:10px;margin-top:8px;color:#94a3b8;font-size:11px}
        `;
        document.head.appendChild(style);
    }

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
        <div class="cbdi-head">
            <div>
                <div class="cbdi-title">Диагностика кассы «Цветные шары»</div>
                <div class="cbdi-note">Снимите пустой билет, заполненные допигры и шаг телефона, затем скачайте один отчёт.</div>
            </div>
            <button class="cbdi-close" id="cbdi-close" type="button" title="Закрыть">×</button>
        </div>
        <input id="cbdi-label" type="text" value="Снимок 1" aria-label="Название снимка">
        <div class="cbdi-actions">
            <button class="cbdi-btn" id="cbdi-scan" type="button">Снять снимок</button>
            <button class="cbdi-btn" id="cbdi-download" type="button">Скачать JSON</button>
            <button class="cbdi-btn secondary" id="cbdi-copy" type="button">Копировать</button>
            <button class="cbdi-btn danger" id="cbdi-reset" type="button">Удалить снимки</button>
        </div>
        <div id="cbdi-status">Готово к сканированию. Покупка не выполняется.</div>
        <div class="cbdi-foot">
            <span id="cbdi-counter">Снимков: ${store.snapshots.length}</span>
            <span>Значения полей не читаются</span>
        </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('cbdi-close').onclick = () => panel.remove();
    document.getElementById('cbdi-scan').onclick = takeSnapshot;
    document.getElementById('cbdi-download').onclick = downloadReport;
    document.getElementById('cbdi-copy').onclick = copyReport;
    document.getElementById('cbdi-reset').onclick = () => {
        store.snapshots.length = 0;
        updateCounter();
        document.getElementById('cbdi-label').value = 'Снимок 1';
        setStatus('Все сохранённые снимки удалены.', true);
    };
})();
