/* ===== БАЗА ДАННЫХ ПРОДУКТОВ (КБЖУ на 100 г) ===== */
const foodDatabase = [
    {name:"Овсянка на молоке", cal:150, pr:5, fat:3, carb:27, emoji:"🥣", fiber:2.5, sugar:6, sodium:80, allergens:["молоко"]},
    {name:"Яичница (2 яйца)", cal:180, pr:12, fat:14, carb:2, emoji:"🍳", fiber:0, sugar:0, sodium:150, allergens:["яйца"]},
    {name:"Творог 5%", cal:121, pr:17, fat:5, carb:1.8, emoji:"🧀", fiber:0, sugar:2.7, sodium:50, allergens:["молоко"]},
    {name:"Блины с творогом", cal:290, pr:10, fat:8, carb:45, emoji:"🥞", fiber:1.8, sugar:8, sodium:240, allergens:["пшеница","яйца","молоко"]},
    {name:"Гречка варёная", cal:100, pr:3, fat:0.6, carb:20, emoji:"🍚", fiber:2.7, sugar:0.5, sodium:2, allergens:[]},
    {name:"Борщ со сметаной", cal:60, pr:3, fat:2, carb:8, emoji:"🥣", fiber:1.5, sugar:2.5, sodium:250, allergens:["молоко"]},
    {name:"Щи", cal:45, pr:2, fat:1, carb:7, emoji:"🥣", fiber:1.6, sugar:2.2, sodium:230, allergens:[]},
    {name:"Куриный суп", cal:55, pr:4, fat:2, carb:6, emoji:"🍜", fiber:0.6, sugar:0.5, sodium:300, allergens:[]},
    {name:"Куриная грудка гриль", cal:165, pr:31, fat:3.6, carb:0, emoji:"🍗", fiber:0, sugar:0, sodium:65, allergens:[]},
    {name:"Котлеты говяжьи", cal:200, pr:15, fat:14, carb:5, emoji:"🥩", fiber:0, sugar:0.5, sodium:380, allergens:["яйца","пшеница"]},
    {name:"Рыба запечённая", cal:120, pr:20, fat:4, carb:1, emoji:"🐟", fiber:0, sugar:0, sodium:70, allergens:["рыба"]},
    {name:"Плов с курицей", cal:180, pr:10, fat:7, carb:20, emoji:"🍛", fiber:1.2, sugar:1.1, sodium:320, allergens:[]},
    {name:"Пельмени", cal:275, pr:12, fat:12, carb:30, emoji:"🥟", fiber:1.6, sugar:1.2, sodium:640, allergens:["пшеница","яйца"]},
    {name:"Рис варёный", cal:130, pr:2.7, fat:0.3, carb:28, emoji:"🍚", fiber:0.4, sugar:0.1, sodium:1, allergens:[]},
    {name:"Картофель варёный", cal:80, pr:2, fat:0.1, carb:17, emoji:"🥔", fiber:1.8, sugar:0.8, sodium:5, allergens:[]},
    {name:"Макароны варёные", cal:115, pr:4, fat:0.5, carb:24, emoji:"🍝", fiber:1.3, sugar:0.7, sodium:1, allergens:["пшеница"]},
    {name:"Салат овощной", cal:35, pr:1, fat:2, carb:4, emoji:"🥗", fiber:1.5, sugar:2.2, sodium:60, allergens:[]},
    {name:"Салат Оливье", cal:200, pr:5, fat:15, carb:10, emoji:"🥗", fiber:1.1, sugar:1.6, sodium:520, allergens:["яйца","молоко"]},
    {name:"Яблоко", cal:52, pr:0.3, fat:0.2, carb:14, emoji:"🍎", fiber:2.4, sugar:10.4, sodium:1, allergens:[]},
    {name:"Банан", cal:89, pr:1.1, fat:0.3, carb:23, emoji:"🍌", fiber:2.6, sugar:12.2, sodium:1, allergens:[]},
    {name:"Йогурт натуральный", cal:60, pr:3, fat:3.2, carb:4, emoji:"🥛", fiber:0, sugar:4.7, sodium:46, allergens:["молоко"]},
    {name:"Лосось на гриле", cal:208, pr:20, fat:13, carb:0, emoji:"🐟", fiber:0, sugar:0, sodium:60, allergens:["рыба"]},
    {name:"Брокколи", cal:34, pr:2.8, fat:0.4, carb:6.6, emoji:"🥦", fiber:2.6, sugar:1.7, sodium:30, allergens:[]},
    {name:"Огурец", cal:16, pr:0.8, fat:0.1, carb:2.8, emoji:"🥒", fiber:0.5, sugar:1.7, sodium:2, allergens:[]},
    {name:"Помидор", cal:20, pr:1.1, fat:0.2, carb:3.8, emoji:"🍅", fiber:1.2, sugar:2.6, sodium:5, allergens:[]},
    {name:"Творог 0%", cal:71, pr:16, fat:0, carb:1.3, emoji:"🧀", fiber:0, sugar:1.3, sodium:50, allergens:["молоко"]},
    {name:"Сыр российский", cal:363, pr:24, fat:29, carb:0, emoji:"🧀", fiber:0, sugar:0.5, sodium:620, allergens:["молоко"]},
    {name:"Хлеб ржаной", cal:210, pr:7, fat:1.2, carb:45, emoji:"🍞", fiber:6.6, sugar:2.3, sodium:570, allergens:["пшеница"]},
    {name:"Хлеб белый", cal:266, pr:9, fat:3, carb:49, emoji:"🍞", fiber:2.7, sugar:5.1, sodium:490, allergens:["пшеница"]},
    {name:"Апельсин", cal:43, pr:0.9, fat:0.2, carb:8.1, emoji:"🍊", fiber:2.2, sugar:8.2, sodium:1, allergens:[]},
    {name:"Кефир 2.5%", cal:50, pr:3, fat:2.5, carb:4, emoji:"🥛", fiber:0, sugar:4.2, sodium:40, allergens:["молоко"]},
    {name:"Минтай", cal:72, pr:16, fat:0.9, carb:0, emoji:"🐟", fiber:0, sugar:0, sodium:80, allergens:["рыба"]},
    {name:"Куриное бедро", cal:185, pr:21, fat:11, carb:0, emoji:"🍗", fiber:0, sugar:0, sodium:80, allergens:[]},
    {name:"Грецкие орехи", cal:654, pr:16, fat:60, carb:11, emoji:"🌰", fiber:6.7, sugar:2.6, sodium:2, allergens:["орехи"]},
    {name:"Семга запечённая", cal:220, pr:22, fat:14, carb:0, emoji:"🐟", fiber:0, sugar:0, sodium:65, allergens:["рыба"]},
    {name:"Кофе американо", cal:5, pr:0.1, fat:0, carb:1, emoji:"☕", fiber:0, sugar:0, sodium:2, allergens:[]},
    {name:"Апельсиновый сок", cal:45, pr:0.7, fat:0.2, carb:10, emoji:"🧃", fiber:0.2, sugar:8, sodium:1, allergens:[]},
    {name:"Зеленый чай", cal:2, pr:0, fat:0, carb:0.5, emoji:"🍵", fiber:0, sugar:0, sodium:0, allergens:[]},
    {name:"Молоко 2.5%", cal:52, pr:2.8, fat:2.5, carb:4.7, emoji:"🥛", fiber:0, sugar:4.7, sodium:47, allergens:["молоко"]},
    {name:"Сметана 15%", cal:160, pr:2.8, fat:15, carb:3.2, emoji:"🥄", fiber:0, sugar:3.2, sodium:40, allergens:["молоко"]},
    {name:"Мед", cal:304, pr:0.3, fat:0, carb:82, emoji:"🍯", fiber:0.2, sugar:82, sodium:4, allergens:[]},
    {name:"Оливковое масло", cal:884, pr:0, fat:100, carb:0, emoji:"🫒", fiber:0, sugar:0, sodium:0, allergens:[]},
    {name:"Авокадо", cal:160, pr:2, fat:15, carb:9, emoji:"🥑", fiber:7, sugar:0.7, sodium:7, allergens:[]},
    {name:"Шпинат", cal:23, pr:2.9, fat:0.4, carb:3.6, emoji:"🥬", fiber:2.2, sugar:0.4, sodium:79, allergens:[]},
    {name:"Морковь", cal:41, pr:0.9, fat:0.2, carb:10, emoji:"🥕", fiber:2.8, sugar:4.7, sodium:69, allergens:[]},
    {name:"Лук репчатый", cal:40, pr:1.1, fat:0.1, carb:9, emoji:"🧅", fiber:1.7, sugar:4.2, sodium:4, allergens:[]},
    {name:"Чеснок", cal:149, pr:6.4, fat:0.5, carb:33, emoji:"🧄", fiber:2.1, sugar:1, sodium:17, allergens:[]},
    {name:"Лимон", cal:29, pr:1.1, fat:0.3, carb:9, emoji:"🍋", fiber:2.8, sugar:2.5, sodium:2, allergens:[]},
    {name:"Виноград", cal:69, pr:0.7, fat:0.2, carb:18, emoji:"🍇", fiber:0.9, sugar:16, sodium:2, allergens:[]},
    {name:"Клубника", cal:32, pr:0.7, fat:0.3, carb:8, emoji:"🍓", fiber:2, sugar:4.9, sodium:1, allergens:[]}
];

/* ===== КАТЕГОРИИ ПРОДУКТОВ ===== */
const foodCategories = {
    "Овощи": ["Огурец", "Помидор", "Брокколи", "Морковь", "Лук репчатый", "Чеснок", "Шпинат"],
    "Фрукты": ["Яблоко", "Банан", "Апельсин", "Лимон", "Виноград", "Клубника", "Авокадо"],
    "Молочные продукты": ["Творог 5%", "Творог 0%", "Сыр российский", "Йогурт натуральный", "Кефир 2.5%", "Молоко 2.5%", "Сметана 15%"],
    "Мясо и птица": ["Куриная грудка гриль", "Котлеты говяжьи", "Куриное бедро"],
    "Рыба и морепродукты": ["Рыба запечённая", "Лосось на гриле", "Минтай", "Семга запечённая"],
    "Крупы и злаки": ["Овсянка на молоке", "Гречка варёная", "Рис варёный", "Макароны варёные"],
    "Готовые блюда": ["Борщ со сметаной", "Щи", "Куриный суп", "Плов с курицей", "Пельмени", "Блины с творогом", "Яичница (2 яйца)", "Салат овощной", "Салат Оливье", "Картофель варёный"],
    "Напитки": ["Кофе американо", "Апельсиновый сок", "Зеленый чай"],
    "Прочее": ["Мед", "Оливковое масло", "Грецкие орехи", "Хлеб ржаной", "Хлеб белый"]
};

/* ===== ВСТРОЕННЫЕ МЕНЮ ПО ГОРОДАМ И ДНЯМ ===== */
const cityMenus = {
    "Санкт-Петербург": {
        1: {
            breakfast: {name:"Гречка каша с маслом + варёное яйцо + огурец", cal:300, pr:12, fat:10, carb:33, emoji:"🥣"},
            lunch: {name:"Борщ с говядиной, овощами и сметаной + ржаной хлеб + курица гриль с морковным салатом", cal:550, pr:35, fat:12, carb:60, emoji:"🥣"},
            dinner: {name:"Лосось на гриле с лимоном, брокколи на пару и варёный картофель", cal:400, pr:27, fat:15, carb:20, emoji:"🐟"}
        },
        2: {
            breakfast: {name:"Овсянка с молоком, банан и орехи", cal:380, pr:12, fat:8, carb:60, emoji:"🥣"},
            lunch: {name:"Рассольник с говядиной + ржаной хлеб; гречка с грибами и луком", cal:520, pr:15, fat:10, carb:70, emoji:"🥣"},
            dinner: {name:"Голубцы с говядиной и рисом со сметаной + салат из помидоров и огурцов", cal:300, pr:19, fat:13, carb:24, emoji:"🥬"}
        },
        3: {
            breakfast: {name:"Сырники со сметаной и ягодами", cal:250, pr:15, fat:10, carb:20, emoji:"🧀"},
            lunch: {name:"Овощной суп + бефстроганов с грибным соусом и пюре", cal:630, pr:30, fat:28, carb:56, emoji:"🍲"},
            dinner: {name:"Треска запечённая с бурым рисом, брокколи и морковью на пару", cal:380, pr:34, fat:5, carb:50, emoji:"🐟"}
        }
    },
    "Москва": {
        1: {
            breakfast: {name:"Блины с маслом и сметаной", cal:320, pr:8, fat:12, carb:45, emoji:"🥞"},
            lunch: {name:"Солянка + пирожок с мясом", cal:620, pr:25, fat:22, carb:72, emoji:"🥣"},
            dinner: {name:"Стейк с картофелем фри и овощами", cal:580, pr:38, fat:24, carb:48, emoji:"🥩"}
        },
        2: {
            breakfast: {name:"Творожная запеканка с изюмом и сметаной", cal:280, pr:18, fat:10, carb:28, emoji:"🧀"},
            lunch: {name:"Уха + котлеты с гречкой", cal:520, pr:32, fat:15, carb:55, emoji:"🍜"},
            dinner: {name:"Курица по-французски с картофелем и сыром", cal:450, pr:28, fat:20, carb:35, emoji:"🍗"}
        }
    },
    "Токио": {
        1: {
            breakfast: {name:"Рис + омлет тамаго", cal:320, pr:12, fat:8, carb:52, emoji:"🍚"},
            lunch: {name:"Мисо суп + курица терияки с рисом", cal:560, pr:30, fat:14, carb:75, emoji:"🍜"},
            dinner: {name:"Лосось + рис + салат", cal:520, pr:32, fat:16, carb:60, emoji:"🍱"}
        },
        2: {
            breakfast: {name:"Рисовая каша + маринованные овощи", cal:280, pr:6, fat:2, carb:58, emoji:"🍚"},
            lunch: {name:"Рамен с курицей и яйцом", cal:480, pr:25, fat:15, carb:62, emoji:"🍜"},
            dinner: {name:"Якитори + салат с тофу и рис", cal:420, pr:28, fat:12, carb:48, emoji:"🍗"}
        }
    }
};

/* ===== ВСТРОЕННЫЕ МЕНЮ (оставлены для совместимости) ===== */
const builtInMenus = cityMenus;

/* ===== СОСТОЯНИЕ ПО УМОЛЧАНИЮ ===== */
const APP_VERSION = 7;
const defaultState = {
    version: APP_VERSION,
    activeProfileId: "adult1",
    profiles: [
        {
            id:"adult1", name:"Взрослый 1", emoji:"👨",
            goals:{cal:2200, pr:110, fat:70, carb:260},
            goalsMicros:{fiber:25,sugar:50,sodium:2300},
            allergies: [],
            liquid:{
                totalGoal: 2000,
                items: [
                    {type: 'water', enabled: true, goal: 1500, consumed: 0, color: '#06b6d4'},
                    {type: 'coffee', enabled: false, goal: 300, consumed: 0, color: '#8B4513'},
                    {type: 'juice', enabled: false, goal: 200, consumed: 0, color: '#FFA500'},
                    {type: 'tea', enabled: false, goal: 300, consumed: 0, color: '#D2691E'}
                ]
            },
            quickProducts: {breakfast: [], lunch: [], dinner: [], snack: []}
        },
        {
            id:"adult2", name:"Взрослый 2", emoji:"👩",
            goals:{cal:1800, pr:90, fat:60, carb:220},
            goalsMicros:{fiber:25,sugar:50,sodium:2300},
            allergies: [],
            liquid:{
                totalGoal: 1800,
                items: [
                    {type: 'water', enabled: true, goal: 1300, consumed: 0, color: '#06b6d4'},
                    {type: 'coffee', enabled: false, goal: 200, consumed: 0, color: '#8B4513'},
                    {type: 'juice', enabled: false, goal: 150, consumed: 0, color: '#FFA500'},
                    {type: 'tea', enabled: false, goal: 250, consumed: 0, color: '#D2691E'}
                ]
            },
            quickProducts: {breakfast: [], lunch: [], dinner: [], snack: []}
        }
    ],
    settings:{
        modules:{
            water:false,
            recipes:false,
            micros:false,
            goalsCalc:false,
            weekPlanner:false,
            shopping:false
        },
        theme:"light"
    },
    userFoods:[],
    favorites:[],
    recipes:[],
    diary:{},
    weekPlan:{},
    currentMenu: null,
    shoppingHistory: []
};
