
/* ===== FOOD DATABASE ===== */
const foodDatabase = [
    {name:"Oatmeal with milk", cal:150, pr:5, fat:3, carb:27, emoji:"🥣", fiber:2.5, sugar:6, sodium:80, allergens:["milk"]},
    {name:"Scrambled eggs (2 eggs)", cal:180, pr:12, fat:14, carb:2, emoji:"🍳", fiber:0, sugar:0, sodium:150, allergens:["eggs"]},
    {name:"Cottage cheese 5%", cal:121, pr:17, fat:5, carb:1.8, emoji:"🧀", fiber:0, sugar:2.7, sodium:50, allergens:["milk"]},
    {name:"Pancakes with cottage cheese", cal:290, pr:10, fat:8, carb:45, emoji:"🥞", fiber:1.8, sugar:8, sodium:240, allergens:["wheat","eggs","milk"]},
    {name:"Boiled buckwheat", cal:100, pr:3, fat:0.6, carb:20, emoji:"🍚", fiber:2.7, sugar:0.5, sodium:2, allergens:[]},
    {name:"Borscht with sour cream", cal:60, pr:3, fat:2, carb:8, emoji:"🥣", fiber:1.5, sugar:2.5, sodium:250, allergens:["milk"]},
    {name:"Shchi", cal:45, pr:2, fat:1, carb:7, emoji:"🥣", fiber:1.6, sugar:2.2, sodium:230, allergens:[]},
    {name:"Chicken soup", cal:55, pr:4, fat:2, carb:6, emoji:"🍜", fiber:0.6, sugar:0.5, sodium:300, allergens:[]},
    {name:"Grilled chicken breast", cal:165, pr:31, fat:3.6, carb:0, emoji:"🍗", fiber:0, sugar:0, sodium:65, allergens:[]},
    {name:"Beef patties", cal:200, pr:15, fat:14, carb:5, emoji:"🥩", fiber:0, sugar:0.5, sodium:380, allergens:["eggs","wheat"]},
    {name:"Baked fish", cal:120, pr:20, fat:4, carb:1, emoji:"🐟", fiber:0, sugar:0, sodium:70, allergens:["fish"]},
    {name:"Plov with chicken", cal:180, pr:10, fat:7, carb:20, emoji:"🍛", fiber:1.2, sugar:1.1, sodium:320, allergens:[]},
    {name:"Dumplings", cal:275, pr:12, fat:12, carb:30, emoji:"🥟", fiber:1.6, sugar:1.2, sodium:640, allergens:["wheat","eggs"]},
    {name:"Boiled rice", cal:130, pr:2.7, fat:0.3, carb:28, emoji:"🍚", fiber:0.4, sugar:0.1, sodium:1, allergens:[]},
    {name:"Boiled potatoes", cal:80, pr:2, fat:0.1, carb:17, emoji:"🥔", fiber:1.8, sugar:0.8, sodium:5, allergens:[]},
    {name:"Boiled pasta", cal:115, pr:4, fat:0.5, carb:24, emoji:"🍝", fiber:1.3, sugar:0.7, sodium:1, allergens:["wheat"]},
    {name:"Vegetable salad", cal:35, pr:1, fat:2, carb:4, emoji:"🥗", fiber:1.5, sugar:2.2, sodium:60, allergens:[]},
    {name:"Olivier salad", cal:200, pr:5, fat:15, carb:10, emoji:"🥗", fiber:1.1, sugar:1.6, sodium:520, allergens:["eggs","milk"]},
    {name:"Apple", cal:52, pr:0.3, fat:0.2, carb:14, emoji:"🍎", fiber:2.4, sugar:10.4, sodium:1, allergens:[]},
    {name:"Banana", cal:89, pr:1.1, fat:0.3, carb:23, emoji:"🍌", fiber:2.6, sugar:12.2, sodium:1, allergens:[]},
    {name:"Natural yogurt", cal:60, pr:3, fat:3.2, carb:4, emoji:"🥛", fiber:0, sugar:4.7, sodium:46, allergens:["milk"]},
    {name:"Grilled salmon", cal:208, pr:20, fat:13, carb:0, emoji:"🐟", fiber:0, sugar:0, sodium:60, allergens:["fish"]},
    {name:"Broccoli", cal:34, pr:2.8, fat:0.4, carb:6.6, emoji:"🥦", fiber:2.6, sugar:1.7, sodium:30, allergens:[]},
    {name:"Cucumber", cal:16, pr:0.8, fat:0.1, carb:2.8, emoji:"🥒", fiber:0.5, sugar:1.7, sodium:2, allergens:[]},
    {name:"Tomato", cal:20, pr:1.1, fat:0.2, carb:3.8, emoji:"🍅", fiber:1.2, sugar:2.6, sodium:5, allergens:[]},
    {name:"Cottage cheese 0%", cal:71, pr:16, fat:0, carb:1.3, emoji:"🧀", fiber:0, sugar:1.3, sodium:50, allergens:["milk"]},
    {name:"Russian cheese", cal:363, pr:24, fat:29, carb:0, emoji:"🧀", fiber:0, sugar:0.5, sodium:620, allergens:["milk"]},
    {name:"Rye bread", cal:210, pr:7, fat:1.2, carb:45, emoji:"🍞", fiber:6.6, sugar:2.3, sodium:570, allergens:["wheat"]},
    {name:"White bread", cal:266, pr:9, fat:3, carb:49, emoji:"🍞", fiber:2.7, sugar:5.1, sodium:490, allergens:["wheat"]},
    {name:"Orange", cal:43, pr:0.9, fat:0.2, carb:8.1, emoji:"🍊", fiber:2.2, sugar:8.2, sodium:1, allergens:[]},
    {name:"Kefir 2.5%", cal:50, pr:3, fat:2.5, carb:4, emoji:"🥛", fiber:0, sugar:4.2, sodium:40, allergens:["milk"]},
    {name:"Pollock", cal:72, pr:16, fat:0.9, carb:0, emoji:"🐟", fiber:0, sugar:0, sodium:80, allergens:["fish"]},
    {name:"Chicken thigh", cal:185, pr:21, fat:11, carb:0, emoji:"🍗", fiber:0, sugar:0, sodium:80, allergens:[]},
    {name:"Walnuts", cal:654, pr:16, fat:60, carb:11, emoji:"🌰", fiber:6.7, sugar:2.6, sodium:2, allergens:["nuts"]},
    {name:"Baked salmon", cal:220, pr:22, fat:14, carb:0, emoji:"🐟", fiber:0, sugar:0, sodium:65, allergens:["fish"]},
    {name:"Americano coffee", cal:5, pr:0.1, fat:0, carb:1, emoji:"☕", fiber:0, sugar:0, sodium:2, allergens:[]},
    {name:"Orange juice", cal:45, pr:0.7, fat:0.2, carb:10, emoji:"🧃", fiber:0.2, sugar:8, sodium:1, allergens:[]},
    {name:"Green tea", cal:2, pr:0, fat:0, carb:0.5, emoji:"🍵", fiber:0, sugar:0, sodium:0, allergens:[]},
    {name:"Milk 2.5%", cal:52, pr:2.8, fat:2.5, carb:4.7, emoji:"🥛", fiber:0, sugar:4.7, sodium:47, allergens:["milk"]},
    {name:"Sour cream 15%", cal:160, pr:2.8, fat:15, carb:3.2, emoji:"🥄", fiber:0, sugar:3.2, sodium:40, allergens:["milk"]},
    {name:"Honey", cal:304, pr:0.3, fat:0, carb:82, emoji:"🍯", fiber:0.2, sugar:82, sodium:4, allergens:[]},
    {name:"Olive oil", cal:884, pr:0, fat:100, carb:0, emoji:"🫒", fiber:0, sugar:0, sodium:0, allergens:[]},
    {name:"Avocado", cal:160, pr:2, fat:15, carb:9, emoji:"🥑", fiber:7, sugar:0.7, sodium:7, allergens:[]},
    {name:"Spinach", cal:23, pr:2.9, fat:0.4, carb:3.6, emoji:"🥬", fiber:2.2, sugar:0.4, sodium:79, allergens:[]},
    {name:"Carrot", cal:41, pr:0.9, fat:0.2, carb:10, emoji:"🥕", fiber:2.8, sugar:4.7, sodium:69, allergens:[]},
    {name:"Onion", cal:40, pr:1.1, fat:0.1, carb:9, emoji:"🧅", fiber:1.7, sugar:4.2, sodium:4, allergens:[]},
    {name:"Garlic", cal:149, pr:6.4, fat:0.5, carb:33, emoji:"🧄", fiber:2.1, sugar:1, sodium:17, allergens:[]},
    {name:"Lemon", cal:29, pr:1.1, fat:0.3, carb:9, emoji:"🍋", fiber:2.8, sugar:2.5, sodium:2, allergens:[]},
    {name:"Grapes", cal:69, pr:0.7, fat:0.2, carb:18, emoji:"🍇", fiber:0.9, sugar:16, sodium:2, allergens:[]},
    {name:"Strawberry", cal:32, pr:0.7, fat:0.3, carb:8, emoji:"🍓", fiber:2, sugar:4.9, sodium:1, allergens:[]}
];

/* ===== FOOD CATEGORIES FOR SHOPPING ===== */
const foodCategories = {
    "Vegetables": ["Cucumber", "Tomato", "Broccoli", "Carrot", "Onion", "Garlic", "Spinach"],
    "Fruits": ["Apple", "Banana", "Orange", "Lemon", "Grapes", "Strawberry", "Avocado"],
    "Dairy products": ["Cottage cheese 5%", "Cottage cheese 0%", "Russian cheese", "Natural yogurt", "Kefir 2.5%", "Milk 2.5%", "Sour cream 15%"],
    "Meat and poultry": ["Grilled chicken breast", "Beef patties", "Chicken thigh"],
    "Fish and seafood": ["Baked fish", "Grilled salmon", "Pollock", "Baked salmon"],
    "Grains and cereals": ["Oatmeal with milk", "Boiled buckwheat", "Boiled rice", "Boiled pasta"],
    "Beverages": ["Americano coffee", "Orange juice", "Green tea"],
    "Other": ["Honey", "Olive oil", "Walnuts", "Rye bread", "White bread"]
};

/* ===== CITY MENUS BY DAYS ===== */
const cityMenus = {
    "Saint Petersburg": {
        1: {
            breakfast: {name:"Buckwheat porridge with butter + boiled egg + cucumber", cal:300, pr:12, fat:10, carb:33, emoji:"🥣"},
            lunch: {name:"Borscht with beef, vegetables and sour cream + rye bread + grilled chicken with carrot salad", cal:550, pr:35, fat:12, carb:60, emoji:"🥣"},
            dinner: {name:"Grilled salmon with lemon, steamed broccoli and boiled potatoes", cal:400, pr:27, fat:15, carb:20, emoji:"🐟"}
        },
        2: {
            breakfast: {name:"Oatmeal with milk, banana and nuts", cal:380, pr:12, fat:8, carb:60, emoji:"🥣"},
            lunch: {name:"Rassolnik with beef + rye bread; buckwheat with mushrooms and onions", cal:520, pr:15, fat:10, carb:70, emoji:"🥣"},
            dinner: {name:"Cabbage rolls with beef and rice with sour cream + tomato and cucumber salad", cal:300, pr:19, fat:13, carb:24, emoji:"🥬"}
        },
        3: {
            breakfast: {name:"Syrniki with sour cream and berries", cal:250, pr:15, fat:10, carb:20, emoji:"🧀"},
            lunch: {name:"Vegetable soup + beef stroganoff with mushroom sauce and mashed potatoes", cal:630, pr:30, fat:28, carb:56, emoji:"🍲"},
            dinner: {name:"Baked cod with brown rice, steamed broccoli and carrots", cal:380, pr:34, fat:5, carb:50, emoji:"🐟"}
        }
    },
   //* "Moscow": {
    //*    1: {
    //*        breakfast: {name:"Pancakes with butter and sour cream", cal:320, pr:8, fat:12, carb:45, emoji:"🥞"},
     //*       lunch: {name:"Solyanka + meat pie", cal:620, pr:25, fat:22, carb:72, emoji:"🥣"},
     //*       dinner: {name:"Steak with french fries and vegetables", cal:580, pr:38, fat:24, carb:48, emoji:"🥩"}
     //*   },
     //*  2: {
      //*      breakfast: {name:"Cottage cheese casserole with raisins and sour cream", cal:280, pr:18, fat:10, carb:28, emoji:"🧀"},
     //*      lunch: {name:"Uha + patties with buckwheat", cal:520, pr:32, fat:15, carb:55, emoji:"🍜"},
      //*      dinner: {name:"Chicken French-style with potatoes and cheese", cal:450, pr:28, fat:20, carb:35, emoji:"🍗"}
     //*   }
  //*  },
  //*  "Tokyo": {
   //*     1: {
   //*         breakfast: {name:"Rice + tamagoyaki", cal:320, pr:12, fat:8, carb:52, emoji:"🍚"},
    //*        lunch: {name:"Miso soup + teriyaki chicken with rice", cal:560, pr:30, fat:14, carb:75, emoji:"🍜"},
    //*        dinner: {name:"Salmon + rice + salad", cal:520, pr:32, fat:16, carb:60, emoji:"🍱"}
    //*    },
    //*    2: {
    //*        breakfast: {name:"Rice porridge + pickled vegetables", cal:280, pr:6, fat:2, carb:58, emoji:"🍚"},
    //*       lunch: {name:"Ramen with chicken and egg", cal:480, pr:25, fat:15, carb:62, emoji:"🍜"},
     //*       dinner: {name:"Yakitori + tofu salad with rice", cal:420, pr:28, fat:12, carb:48, emoji:"🍗"}
    //*    }
   //* }
};

/* ===== BUILT-IN MENUS (left for compatibility) ===== */
const builtInMenus = cityMenus;

/* ===== DEFAULT STATE ===== */
// Incremented to 7 to reflect new fields (allergies) and vitamin tracking
const APP_VERSION = 7;
const defaultState = {
    version: APP_VERSION,
    activeProfileId: "adult1",
    profiles: [
        {
            id:"adult1", name:"Adult 1", emoji:"👨",
            goals:{cal:2200, pr:110, fat:70, carb:260},
            goalsMicros:{fiber:25,sugar:50,sodium:2300},
            // list of allergens for this profile
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
            id:"adult2", name:"Adult 2", emoji:"👩",
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
