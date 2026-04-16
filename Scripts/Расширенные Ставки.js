<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Калькулятор расширенных ставок</title>
    <style>
        :root {
            --color-primary: #1a5cff;
            --color-secondary: #2a7f62;
            --color-accent: #c9933e;
            --color-surface: #f8f9fa;
            --color-text: #1a1a1a;
            --color-border: #dce0e5;
            --color-win: #2a7f62;
            --color-loss: #d93025;
            --color-super8: #2e7d32;
            --color-mag8: #8e24aa;
            --color-trilogy: #d32f2f;
            --color-536: #880e4f;
            --color-12dd: #00796b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, system-ui, sans-serif;
            background: #f0f2f5; margin: 0; padding: 20px; color: var(--color-text);
            display: flex; justify-content: center; min-height: 100vh;
        }

        /* === ОСНОВНОЙ КОНТЕЙНЕР === */
        .container {
            max-width: 900px; width: 100%; background: white;
            border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); overflow: hidden;
        }
        .header {
            background: #1a1a1a; color: white; padding: 25px; text-align: center;
        }
        .header h1 { font-size: 22px; margin-bottom: 5px; }
        .header p { color: #aaa; font-size: 13px; }

        /* === ВКЛАДКИ === */
        .tabs { display: flex; background: #f8f9fa; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
        .tab {
            flex: 1; padding: 16px 10px; text-align: center; cursor: pointer;
            font-weight: 600; transition: 0.3s; border-bottom: 3px solid transparent; min-width: 100px; font-size: 13px;
            user-select: none;
        }
        .tab:hover { background: #eef0f3; }
        .tab.active-mag8 { border-bottom-color: var(--color-mag8); color: var(--color-mag8); background: white; }
        .tab.active-trilogy { border-bottom-color: var(--color-trilogy); color: var(--color-trilogy); background: white; }
        .tab.active-an { border-bottom-color: var(--color-primary); color: var(--color-primary); background: white; }
        .tab.active-820 { border-bottom-color: var(--color-secondary); color: var(--color-secondary); background: white; }
        .tab.active-premier { border-bottom-color: var(--color-accent); color: var(--color-accent); background: white; }
        .tab.active-super8 { border-bottom-color: var(--color-super8); color: var(--color-super8); background: white; }
        .tab.active-536 { border-bottom-color: var(--color-536); color: var(--color-536); background: white; }
        .tab.active-12dd { border-bottom-color: var(--color-12dd); color: var(--color-12dd); background: white; }

        /* === КОНТЕНТ === */
        .content { padding: 30px; display: none; }
        .content.active { display: block; animation: fadeIn 0.3s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .section-title {
            font-size: 18px; font-weight: 700; margin-bottom: 20px;
            display: flex; align-items: center; gap: 10px; color: #333;
        }
        .inputs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 25px; }
        .form-group { display: flex; flex-direction: column; }
        label { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #555; }
        input[type="number"] { padding: 12px; border: 2px solid var(--color-border); border-radius: 8px; font-size: 16px; font-weight: 600; width: 100%; }
        input[type="number"]:focus { border-color: #1a5cff; outline: none; }

        .results-box {
            background: var(--color-surface); border-radius: 12px; padding: 25px;
            border: 1px solid var(--color-border); margin-bottom: 20px;
        }
        .res-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
        .res-row.total { border-bottom: none; border-top: 2px solid var(--color-border); margin-top: 10px; font-size: 22px; }
        .res-val { font-weight: 800; }
        .formula { font-family: monospace; background: #eee; padding: 2px 5px; border-radius: 3px; color: #555; font-size: 13px; }

        .breakdown-table {
            width: 100%; border-collapse: collapse; margin-top: 15px; background: white; border-radius: 8px; overflow: hidden;
        }
        .breakdown-table th { background: #f1f3f4; padding: 12px; font-size: 12px; text-align: left; }
        .breakdown-table td { padding: 12px; border-bottom: 1px solid #f1f3f4; font-size: 14px; }
        .breakdown-table tr:last-child td { border-bottom: none; }

        /* === ПРАВЫЙ САЙДБАР === */
        #calcSidebar {
            position: fixed;
            left: calc(50% + 470px);
            top: 80px;
            width: 340px;
            max-height: calc(100vh - 100px);
            background: white;
            border: 1px solid var(--color-border);
            border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            z-index: 1000;
            overflow-y: auto;
            font-size: 14px;
            display: flex;
            flex-direction: column;
        }
        .calc-sidebar-header {
            background: #1a1a1a; color: white; padding: 14px 15px;
            font-weight: 700; display: flex; justify-content: space-between; align-items: center;
            position: sticky; top: 0; z-index: 1; border-radius: 12px 12px 0 0;
            font-size: 13px;
        }
        .calc-sidebar-actions { display: flex; gap: 8px; }
        .btn-calc-sidebar {
            background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);
            padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: 0.2s; font-weight: 600;
        }
        .btn-calc-sidebar:hover { background: rgba(255,255,255,0.2); }
        .btn-calc-sidebar.active { background: var(--color-secondary); border-color: var(--color-secondary); }

        .calc-sidebar-table {
            width: 100%; border-collapse: collapse; margin-bottom: 0; background: white; font-size: 13px;
        }
        .calc-sidebar-table th {
            background: #f0f2f5; padding: 8px; font-size: 11px; text-transform: uppercase;
            color: #555; text-align: left; border-bottom: 1px solid var(--color-border); position: sticky; top: 0;
        }
        .calc-sidebar-table th:last-child { text-align: right; }
        .calc-sidebar-table td { padding: 8px; border-bottom: 1px solid #f1f1f1; }
        .calc-sidebar-table tr:last-child td { border-bottom: none; }
        .calc-sidebar-table .sum-col {
            text-align: right; font-weight: 700; color: var(--color-secondary); font-variant-numeric: tabular-nums;
        }
        .edit-input {
            width: 100%; padding: 4px; border: 1px solid var(--color-primary); border-radius: 4px;
            text-align: right; font-weight: 700; font-size: 14px; color: var(--color-primary); background: #f0f4ff;
        }

        @media (max-width: 1300px) {
            #calcSidebar { display: none; }
            body { padding: 10px; }
        }
    </style>
</head>
<body>

<!-- ===== ПРАВЫЙ САЙДБАР ===== -->
<div id="calcSidebar">
    <div class="calc-sidebar-header">
        <span id="calcSidebarTitle">&#127942; Таблица выигрышей</span>
        <div class="calc-sidebar-actions">
            <button id="btnEditCalcPrizes" class="btn-calc-sidebar" onclick="toggleCalcEditMode()">&#9999;&#65039; Редактировать</button>
            <button id="btnSaveCalcPrizes" class="btn-calc-sidebar active" onclick="saveCalcPrizes()" style="display:none;">&#9989; Готово</button>
        </div>
    </div>
    <div id="calcSidebarContent"></div>
</div>

<!-- ===== ОСНОВНОЙ КОНТЕЙНЕР ===== -->
<div class="container">
    <div class="header">
        <h1>&#128202; Калькулятор расширенных ставок</h1>
        <p>Расчёт комбинаций, стоимости и выигрышей для всех лотерей</p>
    </div>

    <div class="tabs">
        <div id="btnMag8" class="tab active-mag8" onclick="showTab('Mag8')">Великолепная 8</div>
        <div id="btnTrilogy" class="tab" onclick="showTab('Trilogy')">Трилогия</div>
        <div id="btn820" class="tab" onclick="showTab('820')">Большая 8</div>
        <div id="btnSuper8" class="tab" onclick="showTab('Super8')">Супер 8</div>
        <div id="btnAN" class="tab" onclick="showTab('AN')">Топ 12</div>
        <div id="btnPremier" class="tab" onclick="showTab('Premier')">Премьер</div>
        <div id="btn536" class="tab" onclick="showTab('536')">5 из 36</div>
        <div id="btn12dd" class="tab" onclick="showTab('12dd')">12 Добрых Дел</div>
    </div>

    <!-- === 1. ВЕЛИКОЛЕПНАЯ 8 === -->
    <div id="tabMag8" class="content active">
        <div class="section-title">&#9881;&#65039; Параметры: Великолепная 8 (8 из 20 + 1 из 4)</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в Поле 1 (8-12)</label><input type="number" id="m8_n1" value="8" min="8" max="12" oninput="runMag8()"></div>
            <div class="form-group"><label>Чисел в Поле 2 (1-4)</label><input type="number" id="m8_n2" value="1" min="1" max="4" oninput="runMag8()"></div>
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="m8_price" value="80" min="1" oninput="runMag8()"></div>
        </div>
        <div class="inputs-grid">
            <div class="form-group"><label>Угадано в Поле 1 (0-8)</label><input type="number" id="m8_k1" value="5" min="0" max="8" oninput="runMag8()"></div>
            <div class="form-group"><label>Угадано в Поле 2 (0-1)</label><input type="number" id="m8_k2" value="0" min="0" max="1" oninput="runMag8()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C(n1,8)*n2</span></span><span class="res-val" id="m8_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="m8_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="m8_res_win" style="color:var(--color-mag8)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="m8_res_profit">-</span></div>
            <div id="m8_details"></div>
        </div>
    </div>

    <!-- === 2. ТРИЛОГИЯ === -->
    <div id="tabTrilogy" class="content">
        <div class="section-title">&#9881;&#65039; Параметры: Трилогия (4x24 + 2x8 + 1x3)</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в Поле 1 (4-15)</label><input type="number" id="tr_n1" value="4" min="4" max="15" oninput="runTrilogy()"></div>
            <div class="form-group"><label>Чисел в Поле 2 (2-8)</label><input type="number" id="tr_n2" value="2" min="2" max="8" oninput="runTrilogy()"></div>
            <div class="form-group"><label>Чисел в Поле 3 (1-3)</label><input type="number" id="tr_n3" value="1" min="1" max="3" oninput="runTrilogy()"></div>
        </div>
        <div class="inputs-grid">
            <div class="form-group"><label>Угадано в Поле 1 (0-4)</label><input type="number" id="tr_k1" value="4" min="0" max="4" oninput="runTrilogy()"></div>
            <div class="form-group"><label>Угадано в Поле 2 (0-2)</label><input type="number" id="tr_k2" value="2" min="0" max="2" oninput="runTrilogy()"></div>
            <div class="form-group"><label>Угадано в Поле 3 (0-1)</label><input type="number" id="tr_k3" value="1" min="0" max="1" oninput="runTrilogy()"></div>
        </div>
        <div class="inputs-grid">
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="tr_price" value="100" min="1" oninput="runTrilogy()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C1*C2*C3</span></span><span class="res-val" id="tr_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="tr_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="tr_res_win" style="color:var(--color-trilogy)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="tr_res_profit">-</span></div>
            <div id="tr_alert" style="color:red;font-weight:bold;margin-top:10px;display:none;">&#9888;&#65039; Выбрано более 18 чисел суммарно!</div>
            <div id="tr_details"></div>
        </div>
    </div>

    <!-- === 3. БОЛЬШАЯ 8 === -->
    <div id="tab820" class="content">
        <div class="section-title">&#9881;&#65039; Параметры: Большая 8 (8 из 20 + 1 из 4)</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в Поле 1 (8-12)</label><input type="number" id="v_n1" value="8" min="8" max="12" oninput="run820()"></div>
            <div class="form-group"><label>Чисел в Поле 2 (1-4)</label><input type="number" id="v_n2" value="1" min="1" max="4" oninput="run820()"></div>
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="v_price" value="250" min="1" oninput="run820()"></div>
        </div>
        <div class="inputs-grid">
            <div class="form-group"><label>Угадано в Поле 1 (0-8)</label><input type="number" id="v_k1" value="5" min="0" max="8" oninput="run820()"></div>
            <div class="form-group"><label>Угадано в Поле 2 (0-1)</label><input type="number" id="v_k2" value="0" min="0" max="1" oninput="run820()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C(n1,8)*n2</span></span><span class="res-val" id="v_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="v_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="v_res_win" style="color:var(--color-secondary)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="v_res_profit">-</span></div>
            <div id="v_details"></div>
        </div>
    </div>

    <!-- === 4. СУПЕР 8 === -->
    <div id="tabSuper8" class="content">
        <div class="section-title">&#9881;&#65039; Параметры: Супер 8 (8 из 20 + 1 из 4)</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в Поле 1 (8-12)</label><input type="number" id="s8_n1" value="8" min="8" max="12" oninput="runSuper8()"></div>
            <div class="form-group"><label>Чисел в Поле 2 (1-4)</label><input type="number" id="s8_n2" value="1" min="1" max="4" oninput="runSuper8()"></div>
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="s8_price" value="700" min="1" oninput="runSuper8()"></div>
        </div>
        <div class="inputs-grid">
            <div class="form-group"><label>Угадано в Поле 1 (0-8)</label><input type="number" id="s8_k1" value="5" min="0" max="8" oninput="runSuper8()"></div>
            <div class="form-group"><label>Угадано в Поле 2 (0-1)</label><input type="number" id="s8_k2" value="0" min="0" max="1" oninput="runSuper8()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C(n1,8)*n2</span></span><span class="res-val" id="s8_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="s8_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="s8_res_win" style="color:var(--color-super8)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="s8_res_profit">-</span></div>
            <div id="s8_details"></div>
        </div>
    </div>

    <!-- === 5. ТОП 12 === -->
    <div id="tabAN" class="content">
        <div class="section-title">&#9881;&#65039; Параметры: Топ 12 (Всё или ничего)</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в ставке (12-15)</label><input type="number" id="an_n" value="14" min="12" max="15" oninput="runAN()"></div>
            <div class="form-group"><label>Угадано чисел (0-12)</label><input type="number" id="an_k" value="4" min="0" max="12" oninput="runAN()"></div>
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="an_price" value="150" min="1" oninput="runAN()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C(n,12)</span></span><span class="res-val" id="an_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="an_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="an_res_win" style="color:var(--color-primary)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="an_res_profit">-</span></div>
            <div id="an_details"></div>
        </div>
    </div>

    <!-- === 6. ПРЕМЬЕР === -->
    <div id="tabPremier" class="content">
        <div class="section-title">&#9881;&#65039; Параметры: Премьер (4+4)</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в Поле 1 (4-12)</label><input type="number" id="pr_n1" value="5" min="4" max="12" oninput="runPremier()"></div>
            <div class="form-group"><label>Чисел в Поле 2 (4-12)</label><input type="number" id="pr_n2" value="5" min="4" max="12" oninput="runPremier()"></div>
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="pr_price" value="80" min="1" oninput="runPremier()"></div>
        </div>
        <div class="inputs-grid">
            <div class="form-group"><label>Угадано в Поле 1 (0-4)</label><input type="number" id="pr_k1" value="3" min="0" max="4" oninput="runPremier()"></div>
            <div class="form-group"><label>Угадано в Поле 2 (0-4)</label><input type="number" id="pr_k2" value="3" min="0" max="4" oninput="runPremier()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C(n1,4)*C(n2,4)</span></span><span class="res-val" id="pr_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="pr_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="pr_res_win" style="color:var(--color-accent)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="pr_res_profit">-</span></div>
            <div id="pr_details"></div>
        </div>
    </div>

    <!-- === 7. 5 ИЗ 36 === -->
    <div id="tab536" class="content">
        <div class="section-title">&#9881;&#65039; Параметры: 5 из 36</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в ставке (5-12)</label><input type="number" id="f36_n" value="6" min="5" max="12" oninput="run536()"></div>
            <div class="form-group"><label>Угадано чисел (0-5)</label><input type="number" id="f36_k" value="4" min="0" max="5" oninput="run536()"></div>
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="f36_price" value="500" min="1" oninput="run536()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C(n,5)</span></span><span class="res-val" id="f36_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="f36_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="f36_res_win" style="color:var(--color-536)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="f36_res_profit">-</span></div>
            <div id="f36_details"></div>
        </div>
    </div>

    <!-- === 8. 12 ДОБРЫХ ДЕЛ === -->
    <div id="tab12dd" class="content">
        <div class="section-title">&#9881;&#65039; Параметры: 12 Добрых Дел (12 из 24)</div>
        <div class="inputs-grid">
            <div class="form-group"><label>Чисел в ставке (12-15)</label><input type="number" id="dd_n" value="12" min="12" max="15" oninput="run12dd()"></div>
            <div class="form-group"><label>Угадано чисел (0-12)</label><input type="number" id="dd_k" value="11" min="0" max="12" oninput="run12dd()"></div>
            <div class="form-group"><label>Стоимость билета</label><input type="number" id="dd_price" value="200" min="1" oninput="run12dd()"></div>
        </div>
        <div class="results-box">
            <div class="res-row"><span>Комбинаций <span class="formula">C(n,12)</span></span><span class="res-val" id="dd_res_c">-</span></div>
            <div class="res-row"><span>Стоимость ставки:</span><span class="res-val" id="dd_res_cost">-</span></div>
            <div class="res-row total"><span>&#128176; Общий выигрыш:</span><span class="res-val" id="dd_res_win" style="color:var(--color-12dd)">-</span></div>
            <div class="res-row"><span>Чистая прибыль:</span><span class="res-val" id="dd_res_profit">-</span></div>
            <div id="dd_details"></div>
        </div>
    </div>
</div>

<script>
// =============================================
// БАЗОВЫЕ ФУНКЦИИ
// =============================================
function C(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n / 2) k = n - k;
    var res = 1;
    for (var i = 1; i <= k; i++) res = res * (n - i + 1) / i;
    return Math.round(res);
}

function fmt(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function setResult(prefix, totalC, cost, win) {
    document.getElementById(prefix + '_res_c').innerText = fmt(totalC);
    document.getElementById(prefix + '_res_cost').innerText = fmt(cost) + " \u20BD";
    document.getElementById(prefix + '_res_win').innerText = fmt(win) + " \u20BD";
    document.getElementById(prefix + '_res_profit').innerText = fmt(win - cost) + " \u20BD";
    document.getElementById(prefix + '_res_profit').style.color = (win - cost) >= 0 ? "var(--color-win)" : "var(--color-loss)";
}

function setDetails(prefix, win, rows) {
    document.getElementById(prefix + '_details').innerHTML = win > 0
        ? '<table class="breakdown-table"><thead><tr><th>Категория</th><th>Приз</th><th>Билетов</th><th>Сумма</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : "";
}

// =============================================
// ДАННЫЕ ВЫИГРЫШЕЙ (редактируемые)
// =============================================
var prizesMag8 = [[8,1,531835],[8,0,12500],[7,1,500],[7,0,400],[6,1,125],[6,0,60],[5,1,30],[5,0,15],[4,1,10]];
var prizes820 = [[8,1,5000000],[8,0,500000],[7,1,25000],[7,0,5000],[6,1,2000],[6,0,1250],[5,1,800],[5,0,750],[4,1,750]];
var prizesSuper8 = [[8,1,15000000],[8,0,1400000],[7,1,70000],[7,0,21000],[6,1,8400],[6,0,4200],[5,1,2100],[5,0,1400],[4,1,1400]];
var prizesPremier = [[4,4,120825228],[4,3,80000],[3,4,80000],[4,2,15000],[2,4,15000],[4,1,6000],[1,4,6000],[4,0,6000],[0,4,6000],[3,3,3000],[3,2,600],[2,3,600],[3,1,200],[1,3,200],[3,0,250],[0,3,250],[2,2,150],[2,1,120],[1,2,120],[2,0,100],[0,2,100]];
var prizesTrilogy = [[4,2,1,3000000],[4,2,0,500000],[4,1,1,50000],[4,0,1,30000],[4,1,0,20000],[4,0,0,10000],[3,2,1,5000],[3,2,0,2500],[3,1,1,1750],[2,2,1,1500],[3,0,1,1250],[3,1,0,1000],[2,2,0,900],[3,0,0,900],[2,1,1,800],[2,0,1,800],[2,1,0,750]];
var prizesAN = {12:15170362, 0:15170362, 11:75000, 1:75000, 10:3750, 2:3750, 9:750, 3:750, 8:150, 4:150};
var prizes536 = {5:10000000, 4:50000, 3:5000, 2:2000};
var prizes12dd = {12:10000000, 0:10000000, 11:50000, 1:50000, 10:5000, 2:5000, 9:1000, 3:1000, 8:200, 4:200};

// =============================================
// КАЛЬКУЛЯТОРЫ
// =============================================

function runMag8() {
    var n1 = parseInt(document.getElementById('m8_n1').value) || 8;
    var n2 = parseInt(document.getElementById('m8_n2').value) || 1;
    var k1 = parseInt(document.getElementById('m8_k1').value) || 0;
    var k2 = parseInt(document.getElementById('m8_k2').value) || 0;
    var price = parseInt(document.getElementById('m8_price').value) || 80;
    var totalC = C(n1, 8) * n2;
    var cost = totalC * price;
    var win = 0, rows = "";
    for (var i = 0; i < prizesMag8.length; i++) {
        var m1 = prizesMag8[i][0], m2 = prizesMag8[i][1], cash = prizesMag8[i][2];
        if (k1 >= m1 && k2 >= m2) {
            var cnt = C(k1, m1) * C(n1 - k1, 8 - m1) * C(k2, m2) * C(n2 - k2, 1 - m2);
            if (cnt > 0) { win += cnt * cash; rows += '<tr><td>' + m1 + ' + ' + m2 + '</td><td>' + fmt(cash) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(cnt * cash) + ' \u20BD</b></td></tr>'; }
        }
    }
    setResult('m8', totalC, cost, win);
    setDetails('m8', win, rows);
}

function runTrilogy() {
    var n1 = parseInt(document.getElementById('tr_n1').value) || 4;
    var n2 = parseInt(document.getElementById('tr_n2').value) || 2;
    var n3 = parseInt(document.getElementById('tr_n3').value) || 1;
    var k1 = parseInt(document.getElementById('tr_k1').value) || 0;
    var k2 = parseInt(document.getElementById('tr_k2').value) || 0;
    var k3 = parseInt(document.getElementById('tr_k3').value) || 0;
    var price = parseInt(document.getElementById('tr_price').value) || 100;
    document.getElementById('tr_alert').style.display = (n1 + n2 + n3 > 18) ? 'block' : 'none';
    var totalC = C(n1, 4) * C(n2, 2) * C(n3, 1);
    var cost = totalC * price;
    var win = 0, rows = "";
    var superCnt = 0;
    if (k1 >= 4 && k2 >= 2 && k3 >= 1) {
        superCnt = C(k1, 4) * C(n1 - k1, 0) * C(k2, 2) * C(n2 - k2, 0) * C(k3, 1) * C(n3 - k3, 0);
    }
    if (superCnt > 0) {
        win = superCnt * 3000000;
        rows += '<tr><td>4+2+1 &#127942;</td><td>' + fmt(3000000) + ' \u20BD</td><td>' + fmt(superCnt) + ' шт.</td><td><b>' + fmt(win) + ' \u20BD</b></td></tr>';
        rows += '<tr><td colspan="4" style="color:#d93025;text-align:center;">&#9888;&#65039; Суперприз! Другие выигрыши не суммируются.</td></tr>';
    } else {
        for (var i = 0; i < prizesTrilogy.length; i++) {
            var m1 = prizesTrilogy[i][0], m2 = prizesTrilogy[i][1], m3 = prizesTrilogy[i][2], cash = prizesTrilogy[i][3];
            if (k1 >= m1 && k2 >= m2 && k3 >= m3) {
                var cnt = C(k1, m1) * C(n1 - k1, 4 - m1) * C(k2, m2) * C(n2 - k2, 2 - m2) * C(k3, m3) * C(n3 - k3, 1 - m3);
                if (cnt > 0) { win += cnt * cash; rows += '<tr><td>' + m1 + '+' + m2 + '+' + m3 + '</td><td>' + fmt(cash) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(cnt * cash) + ' \u20BD</b></td></tr>'; }
            }
        }
    }
    setResult('tr', totalC, cost, win);
    setDetails('tr', win, rows);
}

function run820() {
    var n1 = parseInt(document.getElementById('v_n1').value) || 8;
    var n2 = parseInt(document.getElementById('v_n2').value) || 1;
    var k1 = parseInt(document.getElementById('v_k1').value) || 0;
    var k2 = parseInt(document.getElementById('v_k2').value) || 0;
    var price = parseInt(document.getElementById('v_price').value) || 250;
    var totalC = C(n1, 8) * n2;
    var cost = totalC * price;
    var win = 0, rows = "";
    for (var i = 0; i < prizes820.length; i++) {
        var m1 = prizes820[i][0], m2 = prizes820[i][1], cash = prizes820[i][2];
        if (k1 >= m1 && k2 >= m2) {
            var cnt = C(k1, m1) * C(n1 - k1, 8 - m1) * C(k2, m2) * C(n2 - k2, 1 - m2);
            if (cnt > 0) { win += cnt * cash; rows += '<tr><td>' + m1 + ' + ' + m2 + '</td><td>' + fmt(cash) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(cnt * cash) + ' \u20BD</b></td></tr>'; }
        }
    }
    setResult('v', totalC, cost, win);
    setDetails('v', win, rows);
}

function runSuper8() {
    var n1 = parseInt(document.getElementById('s8_n1').value) || 8;
    var n2 = parseInt(document.getElementById('s8_n2').value) || 1;
    var k1 = parseInt(document.getElementById('s8_k1').value) || 0;
    var k2 = parseInt(document.getElementById('s8_k2').value) || 0;
    var price = parseInt(document.getElementById('s8_price').value) || 700;
    var totalC = C(n1, 8) * n2;
    var cost = totalC * price;
    var win = 0, rows = "";
    for (var i = 0; i < prizesSuper8.length; i++) {
        var m1 = prizesSuper8[i][0], m2 = prizesSuper8[i][1], cash = prizesSuper8[i][2];
        if (k1 >= m1 && k2 >= m2) {
            var cnt = C(k1, m1) * C(n1 - k1, 8 - m1) * C(k2, m2) * C(n2 - k2, 1 - m2);
            if (cnt > 0) { win += cnt * cash; rows += '<tr><td>' + m1 + ' + ' + m2 + '</td><td>' + fmt(cash) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(cnt * cash) + ' \u20BD</b></td></tr>'; }
        }
    }
    setResult('s8', totalC, cost, win);
    setDetails('s8', win, rows);
}

function runAN() {
    var n = parseInt(document.getElementById('an_n').value) || 12;
    var k = parseInt(document.getElementById('an_k').value) || 0;
    var price = parseInt(document.getElementById('an_price').value) || 150;
    var totalC = C(n, 12);
    var cost = totalC * price;
    var win = 0, rows = "";
    var s12 = C(k, 12) * C(n - k, 0);
    var s0 = C(k, 0) * C(n - k, 12);
    if (s12 > 0 || s0 > 0) {
        if (s12 > 0) { var w = prizesAN[12] * s12; win += w; rows += '<tr><td>Угадано 12 &#127942;</td><td>' + fmt(prizesAN[12]) + ' \u20BD</td><td>' + fmt(s12) + ' шт.</td><td><b>' + fmt(w) + ' \u20BD</b></td></tr>'; }
        if (s0 > 0) { var w = prizesAN[0] * s0; win += w; rows += '<tr><td>Угадано 0 &#127942;</td><td>' + fmt(prizesAN[0]) + ' \u20BD</td><td>' + fmt(s0) + ' шт.</td><td><b>' + fmt(w) + ' \u20BD</b></td></tr>'; }
        rows += '<tr><td colspan="4" style="color:#d93025;text-align:center;">&#9888;&#65039; Суперприз!</td></tr>';
    } else {
        for (var i = 1; i <= 11; i++) {
            if (prizesAN[i]) {
                var cnt = C(k, i) * C(n - k, 12 - i);
                if (cnt > 0) { var p = prizesAN[i] * cnt; win += p; rows += '<tr><td>Угадано ' + i + '</td><td>' + fmt(prizesAN[i]) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(p) + ' \u20BD</b></td></tr>'; }
            }
        }
    }
    setResult('an', totalC, cost, win);
    setDetails('an', win, rows);
}

function runPremier() {
    var n1 = parseInt(document.getElementById('pr_n1').value) || 4;
    var n2 = parseInt(document.getElementById('pr_n2').value) || 4;
    var k1 = parseInt(document.getElementById('pr_k1').value) || 0;
    var k2 = parseInt(document.getElementById('pr_k2').value) || 0;
    var price = parseInt(document.getElementById('pr_price').value) || 80;
    var totalC = C(n1, 4) * C(n2, 4);
    var cost = totalC * price;
    var win = 0, rows = "";
    for (var i = 0; i < prizesPremier.length; i++) {
        var m1 = prizesPremier[i][0], m2 = prizesPremier[i][1], cash = prizesPremier[i][2];
        if (k1 >= m1 && k2 >= m2) {
            var cnt = C(k1, m1) * C(n1 - k1, 4 - m1) * C(k2, m2) * C(n2 - k2, 4 - m2);
            if (cnt > 0) { win += cnt * cash; rows += '<tr><td>' + m1 + ' + ' + m2 + '</td><td>' + fmt(cash) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(cnt * cash) + ' \u20BD</b></td></tr>'; }
        }
    }
    setResult('pr', totalC, cost, win);
    setDetails('pr', win, rows);
}

function run536() {
    var n = parseInt(document.getElementById('f36_n').value) || 5;
    var k = parseInt(document.getElementById('f36_k').value) || 0;
    var price = parseInt(document.getElementById('f36_price').value) || 500;
    var totalC = C(n, 5);
    var cost = totalC * price;
    var win = 0, rows = "";
    for (var i = 2; i <= 5; i++) {
        if (prizes536[i]) {
            var cnt = C(k, i) * C(n - k, 5 - i);
            if (cnt > 0) { var p = prizes536[i] * cnt; win += p; rows += '<tr><td>Угадано ' + i + '</td><td>' + fmt(prizes536[i]) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(p) + ' \u20BD</b></td></tr>'; }
        }
    }
    setResult('f36', totalC, cost, win);
    setDetails('f36', win, rows);
}

function run12dd() {
    var n = parseInt(document.getElementById('dd_n').value) || 12;
    var k = parseInt(document.getElementById('dd_k').value) || 0;
    var price = parseInt(document.getElementById('dd_price').value) || 200;
    var totalC = C(n, 12);
    var cost = totalC * price;
    var win = 0, rows = "";
    var s12 = C(k, 12) * C(n - k, 0);
    var s0 = C(k, 0) * C(n - k, 12);
    if (s12 > 0 || s0 > 0) {
        if (s12 > 0) { var w = prizes12dd[12] * s12; win += w; rows += '<tr><td>Угадано 12 &#127942;</td><td>' + fmt(prizes12dd[12]) + ' \u20BD</td><td>' + fmt(s12) + ' шт.</td><td><b>' + fmt(w) + ' \u20BD</b></td></tr>'; }
        if (s0 > 0) { var w = prizes12dd[0] * s0; win += w; rows += '<tr><td>Угадано 0 &#127942;</td><td>' + fmt(prizes12dd[0]) + ' \u20BD</td><td>' + fmt(s0) + ' шт.</td><td><b>' + fmt(w) + ' \u20BD</b></td></tr>'; }
        rows += '<tr><td colspan="4" style="color:#d93025;text-align:center;">&#9888;&#65039; Суперприз!</td></tr>';
    } else {
        for (var i = 1; i <= 11; i++) {
            if (prizes12dd[i]) {
                var cnt = C(k, i) * C(n - k, 12 - i);
                if (cnt > 0) { var p = prizes12dd[i] * cnt; win += p; rows += '<tr><td>Угадано ' + i + '</td><td>' + fmt(prizes12dd[i]) + ' \u20BD</td><td>' + fmt(cnt) + ' шт.</td><td><b>' + fmt(p) + ' \u20BD</b></td></tr>'; }
            }
        }
    }
    setResult('dd', totalC, cost, win);
    setDetails('dd', win, rows);
}

// =============================================
// ВКЛАДКИ
// =============================================
var currentTab = 'Mag8';

function showTab(type) {
    currentTab = type;
    var tabs = document.querySelectorAll('.tab');
    var contents = document.querySelectorAll('.content');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].className = 'tab';
    }
    for (var j = 0; j < contents.length; j++) {
        contents[j].className = 'content';
    }
    var tabEl = document.getElementById('btn' + type);
    var contentEl = document.getElementById('tab' + type);
    if (tabEl) { tabEl.className = 'tab active-' + type.toLowerCase(); }
    if (contentEl) { contentEl.className = 'content active'; }
    updateCalcSidebar(type);
}

// =============================================
// САЙДБАР — ТАБЛИЦЫ ВЫИГРЫШЕЙ
// =============================================
var calcEditMode = false;

function updateCalcSidebar(type) {
    var container = document.getElementById('calcSidebarContent');
    var title = document.getElementById('calcSidebarTitle');
    var names = {Mag8:'Великолепная 8', Trilogy:'Трилогия', '820':'Большая 8', Super8:'Супер 8', AN:'Топ 12', Premier:'Премьер', '536':'5 из 36', '12dd':'12 Добрых Дел'};
    title.textContent = '\uD83C\uDFC6 ' + (names[type] || type);
    var html = '';

    if (type === 'Trilogy') {
        html += '<table class="calc-sidebar-table"><thead><tr><th>П1</th><th>П2</th><th>П3</th><th>Приз</th></tr></thead><tbody>';
        for (var i = 0; i < prizesTrilogy.length; i++) {
            var r = prizesTrilogy[i];
            var val = r[3];
            html += '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td class="sum-col" data-arr="prizesTrilogy" data-idx="' + i + '">';
            html += '<span class="pv" style="display:' + (calcEditMode ? 'none' : '') + '">' + fmt(val) + ' \u20BD</span>';
            html += '<input class="edit-input" type="number" value="' + val + '" style="display:' + (calcEditMode ? '' : 'none') + '">';
            html += '</td></tr>';
        }
        html += '</tbody></table>';
    } else if (type === 'Mag8' || type === '820' || type === 'Super8' || type === 'Premier') {
        var arrName = '';
        var arr = [];
        if (type === 'Mag8') { arrName = 'prizesMag8'; arr = prizesMag8; }
        if (type === '820') { arrName = 'prizes820'; arr = prizes820; }
        if (type === 'Super8') { arrName = 'prizesSuper8'; arr = prizesSuper8; }
        if (type === 'Premier') { arrName = 'prizesPremier'; arr = prizesPremier; }
        html += '<table class="calc-sidebar-table"><thead><tr><th>Категория</th><th>Приз</th></tr></thead><tbody>';
        for (var i = 0; i < arr.length; i++) {
            var r = arr[i];
            var cat = '';
            for (var j = 0; j < r.length - 1; j++) { cat += (j > 0 ? ' + ' : '') + r[j]; }
            var val = r[r.length - 1];
            html += '<tr><td>' + cat + '</td><td class="sum-col" data-arr="' + arrName + '" data-idx="' + i + '">';
            html += '<span class="pv" style="display:' + (calcEditMode ? 'none' : '') + '">' + fmt(val) + ' \u20BD</span>';
            html += '<input class="edit-input" type="number" value="' + val + '" style="display:' + (calcEditMode ? '' : 'none') + '">';
            html += '</td></tr>';
        }
        html += '</tbody></table>';
    } else if (type === 'AN' || type === '536' || type === '12dd') {
        var objName = '';
        var obj = {};
        var labelFn = function(k) { return k + ' угадано'; };
        if (type === 'AN') { objName = 'prizesAN'; obj = prizesAN; }
        if (type === '536') { objName = 'prizes536'; obj = prizes536; labelFn = function(k) { return k + ' угадано'; }; }
        if (type === '12dd') { objName = 'prizes12dd'; obj = prizes12dd; labelFn = function(k) { return k + ' или ' + (12 - k); }; }
        html += '<table class="calc-sidebar-table"><thead><tr><th>Категория</th><th>Приз</th></tr></thead><tbody>';
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var val = obj[k];
            html += '<tr><td>' + labelFn(k) + '</td><td class="sum-col" data-obj="' + objName + '" data-key="' + k + '">';
            html += '<span class="pv" style="display:' + (calcEditMode ? 'none' : '') + '">' + fmt(val) + ' \u20BD</span>';
            html += '<input class="edit-input" type="number" value="' + val + '" style="display:' + (calcEditMode ? '' : 'none') + '">';
            html += '</td></tr>';
        }
        html += '</tbody></table>';
    }
    container.innerHTML = html;
}

function toggleCalcEditMode() {
    calcEditMode = true;
    document.getElementById('btnEditCalcPrizes').style.display = 'none';
    document.getElementById('btnSaveCalcPrizes').style.display = '';
    var spans = document.querySelectorAll('#calcSidebarContent .pv');
    var inputs = document.querySelectorAll('#calcSidebarContent .edit-input');
    for (var i = 0; i < spans.length; i++) { spans[i].style.display = 'none'; }
    for (var j = 0; j < inputs.length; j++) { inputs[j].style.display = ''; }
}

function saveCalcPrizes() {
    // Сохраняем массивы
    var cells = document.querySelectorAll('#calcSidebarContent .sum-col[data-idx]');
    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        var arrName = cell.getAttribute('data-arr');
        var idx = parseInt(cell.getAttribute('data-idx'));
        var input = cell.querySelector('input');
        if (input && arrName && window[arrName]) {
            var newVal = parseInt(input.value) || 0;
            var arr = window[arrName];
            arr[idx][arr[idx].length - 1] = newVal;
        }
    }
    // Сохраняем объекты
    var objCells = document.querySelectorAll('#calcSidebarContent .sum-col[data-key]');
    for (var j = 0; j < objCells.length; j++) {
        var cell = objCells[j];
        var objName = cell.getAttribute('data-obj');
        var key = cell.getAttribute('data-key');
        var input = cell.querySelector('input');
        if (input && objName && window[objName]) {
            window[objName][key] = parseInt(input.value) || 0;
        }
    }
    calcEditMode = false;
    document.getElementById('btnEditCalcPrizes').style.display = '';
    document.getElementById('btnSaveCalcPrizes').style.display = 'none';
    // Пересчитываем все и обновляем сайдбар
    updateCalcSidebar(currentTab);
    runMag8(); runTrilogy(); run820(); runSuper8(); runAN(); runPremier(); run536(); run12dd();
}

// =============================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================
window.onload = function() {
    runMag8(); runTrilogy(); run820(); runSuper8(); runAN(); runPremier(); run536(); run12dd();
    updateCalcSidebar('Mag8');
};
</script>

</body>
</html>
