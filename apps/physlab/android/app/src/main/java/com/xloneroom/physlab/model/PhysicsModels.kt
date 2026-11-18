package com.xloneroom.physlab.model

enum class PhysicsBranch(val title: String, val badgeColor: Long) {
    MECHANICS("Механика", 0xFF38BDF8),
    THERMODYNAMICS("Молекулярная физика", 0xFFF97316),
    ELECTRICITY("Электричество и магнетизм", 0xFFFACC15),
    OPTICS("Оптика", 0xFFA855F7),
    WAVES("Колебания и волны", 0xFF2DD4BF),
    QUANTUM("Кванты и ядро", 0xFFEC4899),
    ASTROPHYSICS("Астрофизика", 0xFF6366F1)
}

enum class ParamKind {
    SLIDER,
    TOGGLE,
    CHOICE
}

data class ParamDescriptor(
    val key: String,
    val label: String,
    val unit: String,
    val min: Double,
    val max: Double,
    val step: Double,
    val defaultValue: Double,
    val kind: ParamKind = ParamKind.SLIDER,
    val decimals: Int = 2,
    val choices: List<String> = emptyList(),
    val hint: String = ""
)

data class TopicPreset(
    val id: String,
    val label: String,
    val description: String,
    val values: Map<String, Double>
)

data class LabTask(
    val id: String,
    val text: String
)

data class ReadyLabWork(
    val id: String,
    val title: String,
    val grade: String,
    val goal: String,
    val topic: ExperimentTopic,
    val initialParams: Map<String, Double>
)

/** Один автоматический замер: параметры выставляются, модель прогоняется и показания попадают в отчёт. */
data class AutoLabStep(
    val id: String,
    val title: String,
    val instruction: String,
    val params: Map<String, Double>,
    val durationSec: Double = 0.10
)

/** Готовая авто-серия для 10–11 классов. Выполняется локально, без сети и без «подстановки» данных. */
data class AutoLabWork(
    val id: String,
    val title: String,
    val grade: String,
    val goal: String,
    val topic: ExperimentTopic,
    val expectedConclusion: String,
    val steps: List<AutoLabStep>
)

enum class ExperimentTopic(
    val id: String,
    val title: String,
    val branch: PhysicsBranch,
    val gradeLabel: String,
    val mainFormula: String,
    val shortDesc: String,
    val theoryNotes: String
) {
    BALLISTICS(
        id = "ballistics",
        title = "Баллистика и свободное падение",
        branch = PhysicsBranch.MECHANICS,
        gradeLabel = "9–11 кл.",
        mainFormula = "r(t) = r₀ + v₀t + ½at²,  F_сопр = ½ρC_dAv²",
        shortDesc = "Полёт тела под углом к горизонту: воздух, ветер, гравитация планет и отскок.",
        theoryNotes = "В вакууме траектория — симметричная парабола, а максимальная дальность при h₀ = 0 достигается при α = 45°. Воздух тормозит тело и делает спуск круче. При ударе о землю часть энергии (1 − e²)·E_k уходит в тепло."
    ),
    PENDULUM(
        id = "pendulum",
        title = "Маятник и резонанс",
        branch = PhysicsBranch.MECHANICS,
        gradeLabel = "9–11 кл.",
        mainFormula = "T = 2π√(L/g),  T_пруж = 2π√(m/k)",
        shortDesc = "Математический и пружинный маятник: затухание, вынужденные колебания и замер периода.",
        theoryNotes = "Период математического маятника при малых углах не зависит от массы (изохронность Галилея), а пружинного — не зависит от g. При совпадении частоты внешней силы ω с собственной ω₀ наступает резонанс."
    ),
    COLLISIONS(
        id = "collisions",
        title = "Столкновения и импульс",
        branch = PhysicsBranch.MECHANICS,
        gradeLabel = "9–10 кл.",
        mainFormula = "m₁v₁ + m₂v₂ = const,  e = |v₂' − v₁'| / |v₁ − v₂|",
        shortDesc = "Упругие и неупругие удары на воздушной дорожке: векторы скоростей и центр масс.",
        theoryNotes = "В замкнутой системе без трения суммарный импульс сохраняется при любом ударе. При абсолютно упругом ударе (e = 1) сохраняется и кинетическая энергия; при неупругом (e = 0) тела слипаются."
    ),
    BUOYANCY(
        id = "buoyancy",
        title = "Закон Архимеда и плавание",
        branch = PhysicsBranch.MECHANICS,
        gradeLabel = "7–10 кл.",
        mainFormula = "F_A = ρ_ж · g · V_погр,  F_тяж = ρ_т · g · V",
        shortDesc = "Погружение тела в воду, масло, глицерин или ртуть: выталкивающая сила и уровень жидкости.",
        theoryNotes = "Тело тонет, если ρ_т > ρ_ж (сила тяжести больше максимальной силы Архимеда), плавает внутри жидкости при ρ_т = ρ_ж и всплывает при ρ_т < ρ_ж, выступая над поверхностью так, что F_A = mg."
    ),
    INCLINED_PLANE(
        id = "inclined_plane",
        title = "Наклонная плоскость и трение",
        branch = PhysicsBranch.MECHANICS,
        gradeLabel = "7–10 кл.",
        mainFormula = "F_ск = mg·sin(α),  F_тр = μ·mg·cos(α),  η = A_п / A_з",
        shortDesc = "Разложение силы тяжести на скатывающую и прижимающую, трение покоя и КПД.",
        theoryNotes = "Брусок начинает скользить вниз, когда скатывающая сила mg·sin(α) превышает максимальное трение покоя μ·mg·cos(α), то есть при tg(α) > μ. Пологий склон даёт выигрыш в силе, но трение снижает КПД."
    ),
    IDEAL_GAS(
        id = "ideal_gas",
        title = "Идеальный газ и поршень (МКТ)",
        branch = PhysicsBranch.THERMODYNAMICS,
        gradeLabel = "10 кл.",
        mainFormula = "PV = νRT,  P = ⅓nm₀v_кв²,  E_ср = (3/2)kT",
        shortDesc = "До 160 молекул под подвижным поршнем: изопроцессы, адиабата и P(V)-диаграмма.",
        theoryNotes = "Давление создаётся ударами молекул о стенки. Изотерма (T=const) подчиняется P·V=const, изобара (P=const) даёт V ~ T, а при быстром адиабатном сжатии работа поршня разогревает газ."
    ),
    CIRCUITS(
        id = "circuits",
        title = "Электрические цепи и закон Ома",
        branch = PhysicsBranch.ELECTRICITY,
        gradeLabel = "8–11 кл.",
        mainFormula = "I = ε / (R_внеш + r),  P = I²R,  U_C = ε(1 − e^(−t/RC))",
        shortDesc = "Последовательная, параллельная и RC-цепь: дрейф электронов, накал и заряд конденсатора.",
        theoryNotes = "При последовательном соединении ток одинаков и R = R₁ + R₂; при параллельном одинаково напряжение и 1/R = 1/R₁ + 1/R₂. Внутреннее сопротивление r снижает напряжение на клеммах: U = ε − I·r."
    ),
    ELECTROSTATICS(
        id = "electrostatics",
        title = "Заряд в полях E и B (Лоренц)",
        branch = PhysicsBranch.ELECTRICITY,
        gradeLabel = "10–11 кл.",
        mainFormula = "F = qE + q[v × B],  R_ц = mv / (|q|B)",
        shortDesc = "Движение электрона или протона в конденсаторе, магнитном циклотроне и фильтре скоростей.",
        theoryNotes = "Электрическое поле E ускоряет заряд вдоль силовых линий (парабола в конденсаторе). Магнитное поле B действует перпендикулярно скорости, не меняет её величину и закручивает заряд по окружности радиуса R = mv/(|q|B)."
    ),
    ELECTROMAGNETIC(
        id = "electromagnetic",
        title = "Электромагнитная индукция",
        branch = PhysicsBranch.ELECTRICITY,
        gradeLabel = "9–11 кл.",
        mainFormula = "ε_i = −N · (ΔΦ / Δt),  I_i = ε_i / R",
        shortDesc = "Магнит в катушке: закон Фарадея, правило Ленца, гальванометр и генератор.",
        theoryNotes = "Индукционный ток возникает только при изменении магнитного потока Φ через контур! Чем быстрее движется магнит и чем больше витков N, тем выше ЭДС. По правилу Ленца поле катушки противодействует изменению потока."
    ),
    OPTICS(
        id = "optics",
        title = "Линзы и преломление света",
        branch = PhysicsBranch.OPTICS,
        gradeLabel = "8–11 кл.",
        mainFormula = "1/F = 1/d + 1/f,  n₁·sin(α) = n₂·sin(β)",
        shortDesc = "Ход лучей в тонкой линзе, режим лупы, полное внутреннее отражение и дисперсия.",
        theoryNotes = "Собирающая линза (F > 0) при d > F строит действительное перевёрнутое изображение, а при d < F работает как лупа (мнимое увеличенное). При переходе из более плотной среды при α > α_кр свет полностью отражается."
    ),
    WAVES(
        id = "waves",
        title = "Волны и интерференция",
        branch = PhysicsBranch.WAVES,
        gradeLabel = "9–11 кл.",
        mainFormula = "λ = v / f,  Δ = d·sin(θ) = kλ",
        shortDesc = "Стоячие волны (узлы и пучности) и интерференционная картина от двух источников.",
        theoryNotes = "Расстояние между соседними узлами стоячей волны равно половине длины волны λ/2. При интерференции от двух когерентных источников светлые полосы (максимумы) возникают там, где разность хода кратна λ."
    ),
    PHOTOELECTRIC(
        id = "photoelectric",
        title = "Фотоэффект и кванты света",
        branch = PhysicsBranch.QUANTUM,
        gradeLabel = "11 кл.",
        mainFormula = "hν = A_вых + E_k,max,  E_k,max = e·U_з",
        shortDesc = "Выбивание электронов светом разного цвета: красная граница, работа выхода и задержка.",
        theoryNotes = "Фотоэффект происходит, только если энергия одного фотона hc/λ больше работы выхода металла A_вых (длина волны меньше красной границы λ_кр). Скорость электронов зависит от цвета (частоты), а число — от яркости."
    ),
    RADIOACTIVE(
        id = "radioactive",
        title = "Радиоактивный распад",
        branch = PhysicsBranch.QUANTUM,
        gradeLabel = "9–11 кл.",
        mainFormula = "N(t) = N₀ · 2^(−t / T₁/₂),  A = λ·N",
        shortDesc = "Моделирование распада сотен ядер в реальном времени, период полураспада и счётчик Гейгера.",
        theoryNotes = "Каждое ядро распадается случайно и независимо от температуры или давления, но за каждый период полураспада T₁/₂ в среднем остаётся ровно половина нераспавшихся ядер."
    ),
    ORBITS(
        id = "orbits",
        title = "Гравитация и законы Кеплера",
        branch = PhysicsBranch.ASTROPHYSICS,
        gradeLabel = "9–11 кл.",
        mainFormula = "F = GMm/r²,  v₁ = √(GM/r),  v₂ = √(2GM/r)",
        shortDesc = "Планета вокруг звезды: круговые, эллиптические и гиперболические орбиты, сектора Кеплера.",
        theoryNotes = "При v = v₁ орбита круговая; при v₁ < v < v₂ — эллипс, где планета ускоряется в перигелии (заметает равные площади за равное время); при v ≥ v₂ планета навсегда улетает от звезды."
    );

    fun descriptors(): List<ParamDescriptor> = when (this) {
        BALLISTICS -> listOf(
            ParamDescriptor("v0", "Начальная скорость v₀", "м/с", 2.0, 60.0, 0.5, 24.0, decimals = 1),
            ParamDescriptor("angle", "Угол броска α", "°", 5.0, 89.0, 1.0, 45.0, decimals = 0),
            ParamDescriptor("height", "Начальная высота h₀", "м", 0.0, 30.0, 0.5, 2.0, decimals = 1),
            ParamDescriptor("gravity", "Гравитация g", "м/с²", 1.62, 25.0, 0.05, 9.81, decimals = 2),
            ParamDescriptor("mass", "Масса тела m", "кг", 0.2, 20.0, 0.2, 2.0, decimals = 1),
            ParamDescriptor("airDrag", "Сопротивление воздуха", "", 0.0, 1.0, 0.02, 0.18, decimals = 2),
            ParamDescriptor("wind", "Ветер (по/против X)", "м/с", -20.0, 20.0, 0.5, 0.0, decimals = 1),
            ParamDescriptor("restitution", "Упругость отскока e", "", 0.0, 0.96, 0.02, 0.65, decimals = 2),
            ParamDescriptor("showVacuumRef", "Показывать след вакуума", "", 0.0, 1.0, 1.0, 1.0, kind = ParamKind.TOGGLE, decimals = 0)
        )
        PENDULUM -> listOf(
            ParamDescriptor("mode", "Тип маятника", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Нитяной (математический)", "Пружинный")),
            ParamDescriptor("length", "Длина нити L", "м", 0.3, 4.0, 0.05, 1.4, decimals = 2),
            ParamDescriptor("mass", "Масса груза m", "кг", 0.2, 10.0, 0.1, 1.5, decimals = 1),
            ParamDescriptor("gravity", "Гравитация g", "м/с²", 1.62, 25.0, 0.05, 9.81, decimals = 2),
            ParamDescriptor("angle0", "Нач. отклонение θ₀", "° / дм", 4.0, 80.0, 1.0, 35.0, decimals = 0),
            ParamDescriptor("stiffness", "Жёсткость пружины k", "Н/м", 5.0, 120.0, 1.0, 24.0, decimals = 0),
            ParamDescriptor("damping", "Трение / затухание b", "", 0.0, 0.8, 0.01, 0.03, decimals = 2),
            ParamDescriptor("driveAmp", "Внешняя сила F₀", "Н", 0.0, 12.0, 0.2, 0.0, decimals = 1),
            ParamDescriptor("driveFreq", "Частота силы ω", "рад/с", 0.5, 10.0, 0.1, 2.6, decimals = 1)
        )
        COLLISIONS -> listOf(
            ParamDescriptor("m1", "Масса шара 1 (m₁)", "кг", 0.5, 15.0, 0.5, 3.0, decimals = 1),
            ParamDescriptor("v1", "Скорость v₁", "м/с", -12.0, 12.0, 0.5, 5.0, decimals = 1),
            ParamDescriptor("m2", "Масса шара 2 (m₂)", "кг", 0.5, 15.0, 0.5, 1.5, decimals = 1),
            ParamDescriptor("v2", "Скорость v₂", "м/с", -12.0, 12.0, 0.5, -2.0, decimals = 1),
            ParamDescriptor("restitution", "Упругость удара e", "", 0.0, 1.0, 0.05, 1.0, decimals = 2),
            ParamDescriptor("friction", "Трение дорожки μ", "", 0.0, 0.25, 0.01, 0.0, decimals = 2)
        )
        BUOYANCY -> listOf(
            ParamDescriptor("liquidType", "Жидкость", "", 0.0, 3.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Вода (1000)", "Масло (800)", "Глицерин (1260)", "Ртуть (13600)")),
            ParamDescriptor("bodyDensity", "Плотность тела ρ_т", "кг/м³", 200.0, 14000.0, 50.0, 750.0, decimals = 0),
            ParamDescriptor("bodyVolume", "Объём тела V", "л", 0.5, 5.0, 0.1, 2.0, decimals = 1),
            ParamDescriptor("liquidDensity", "Плотность жидкости ρ_ж", "кг/м³", 600.0, 13600.0, 50.0, 1000.0, decimals = 0),
            ParamDescriptor("gravity", "Гравитация g", "м/с²", 1.62, 20.0, 0.1, 9.81, decimals = 2),
            ParamDescriptor("holdSensor", "Держать на динамометре", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.TOGGLE, decimals = 0)
        )
        INCLINED_PLANE -> listOf(
            ParamDescriptor("slopeAngle", "Угол наклона α", "°", 5.0, 65.0, 1.0, 28.0, decimals = 0),
            ParamDescriptor("mass", "Масса бруска m", "кг", 0.5, 20.0, 0.5, 4.0, decimals = 1),
            ParamDescriptor("frictionMu", "Коэфф. трения μ", "", 0.0, 0.9, 0.02, 0.25, decimals = 2),
            ParamDescriptor("pullForce", "Сила тяги вверх F", "Н", 0.0, 120.0, 1.0, 0.0, decimals = 0),
            ParamDescriptor("gravity", "Гравитация g", "м/с²", 1.62, 20.0, 0.1, 9.81, decimals = 2)
        )
        CIRCUITS -> listOf(
            ParamDescriptor("topology", "Схема цепи", "", 0.0, 2.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Последовательная", "Параллельная", "RC-цепь")),
            ParamDescriptor("switchClosed", "Ключ замкнут", "", 0.0, 1.0, 1.0, 1.0, kind = ParamKind.TOGGLE, decimals = 0),
            ParamDescriptor("emf", "ЭДС батареи ε", "В", 1.0, 24.0, 0.5, 12.0, decimals = 1),
            ParamDescriptor("rInt", "Внутр. сопр. r", "Ом", 0.0, 5.0, 0.1, 0.5, decimals = 1),
            ParamDescriptor("r1", "Резистор R₁", "Ом", 2.0, 100.0, 1.0, 10.0, decimals = 0),
            ParamDescriptor("r2", "Резистор R₂", "Ом", 2.0, 100.0, 1.0, 14.0, decimals = 0),
            ParamDescriptor("capacitance", "Ёмкость C (для RC)", "мФ", 5.0, 200.0, 5.0, 40.0, decimals = 0)
        )
        ELECTROSTATICS -> listOf(
            ParamDescriptor("fieldMode", "Режим установки", "", 0.0, 2.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Конденсатор (поле E)", "Циклотрон (поле B)", "Фильтр скоростей (E⊥B)")),
            ParamDescriptor("charge", "Заряд частицы q", "е", -3.0, 3.0, 1.0, 1.0, decimals = 0),
            ParamDescriptor("v0", "Нач. скорость v₀", "у.е.", 2.0, 20.0, 0.5, 9.0, decimals = 1),
            ParamDescriptor("eField", "Поле E (вниз/вверх)", "кВ/м", -15.0, 15.0, 0.5, 6.0, decimals = 1),
            ParamDescriptor("bField", "Магнитное поле B", "мТл", -15.0, 15.0, 0.5, 0.0, decimals = 1),
            ParamDescriptor("massNum", "Относ. масса m", "у.е.", 0.5, 8.0, 0.5, 1.5, decimals = 1)
        )
        ELECTROMAGNETIC -> listOf(
            ParamDescriptor("autoOscillate", "Автоколебание магнита", "", 0.0, 1.0, 1.0, 1.0, kind = ParamKind.TOGGLE, decimals = 0),
            ParamDescriptor("turns", "Число витков катушки N", "шт", 10.0, 200.0, 10.0, 80.0, decimals = 0),
            ParamDescriptor("magStrength", "Сила магнита B", "Тл", 0.2, 2.5, 0.1, 1.2, decimals = 1),
            ParamDescriptor("freq", "Скорость движения f", "Гц", 0.2, 3.0, 0.1, 0.8, decimals = 1),
            ParamDescriptor("coilRes", "Сопротивление цепи R", "Ом", 1.0, 50.0, 1.0, 10.0, decimals = 0),
            ParamDescriptor("polarity", "Полюс впереди (N/S)", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Северный N →", "Южный S →"))
        )
        IDEAL_GAS -> listOf(
            ParamDescriptor("processMode", "Процесс", "", 0.0, 3.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Изотерма (T=const)", "Изохора (V=const)", "Изобара (P=const)", "Адиабата (Q=0)")),
            ParamDescriptor("temperature", "Температура T", "К", 120.0, 900.0, 5.0, 300.0, decimals = 0),
            ParamDescriptor("volume", "Объём сосуда V", "л", 1.5, 10.0, 0.1, 5.0, decimals = 1),
            ParamDescriptor("particles", "Число молекул N", "шт", 20.0, 160.0, 5.0, 75.0, decimals = 0),
            ParamDescriptor("molarMass", "Молярная масса M", "г/моль", 2.0, 40.0, 2.0, 28.0, decimals = 0)
        )
        OPTICS -> listOf(
            ParamDescriptor("optMode", "Оптическая схема", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Тонкая линза", "Преломление (Снеллиус)")),
            ParamDescriptor("focalLen", "Фокус линзы F", "см", -40.0, 40.0, 1.0, 18.0, decimals = 0),
            ParamDescriptor("objDist", "Расст. до предмета d", "см", 6.0, 70.0, 1.0, 32.0, decimals = 0),
            ParamDescriptor("objHeight", "Высота предмета h", "см", 2.0, 16.0, 0.5, 8.0, decimals = 1),
            ParamDescriptor("incidentAngle", "Угол падения α", "°", 0.0, 85.0, 1.0, 38.0, decimals = 0),
            ParamDescriptor("n1", "Показатель среды n₁", "", 1.0, 2.0, 0.01, 1.00, decimals = 2),
            ParamDescriptor("n2", "Показатель среды n₂", "", 1.0, 2.42, 0.01, 1.52, decimals = 2),
            ParamDescriptor("dispersion", "Дисперсия (радуга)", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.TOGGLE, decimals = 0)
        )
        WAVES -> listOf(
            ParamDescriptor("waveMode", "Режим волн", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Стоячая волна", "Интерференция (2 щели)")),
            ParamDescriptor("frequency", "Частота f", "Гц", 0.5, 10.0, 0.1, 2.5, decimals = 1),
            ParamDescriptor("waveSpeed", "Скорость волны v", "м/с", 2.0, 24.0, 0.5, 10.0, decimals = 1),
            ParamDescriptor("amplitude", "Амплитуда A", "см", 1.0, 10.0, 0.5, 5.0, decimals = 1),
            ParamDescriptor("slitDist", "Расст. источников d", "м", 0.5, 6.0, 0.1, 2.4, decimals = 1),
            ParamDescriptor("phaseShift", "Сдвиг фаз Δφ", "°", 0.0, 360.0, 5.0, 0.0, decimals = 0),
            ParamDescriptor("damping", "Затухание среды", "", 0.0, 0.4, 0.02, 0.02, decimals = 2)
        )
        PHOTOELECTRIC -> listOf(
            ParamDescriptor("cathodeMetal", "Металл катода", "", 0.0, 3.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Цезий (2.14 эВ)", "Калий (2.30 эВ)", "Цинк (4.30 эВ)", "Платина (5.65 эВ)")),
            ParamDescriptor("wavelengthNm", "Длина волны света λ", "нм", 150.0, 750.0, 5.0, 400.0, decimals = 0),
            ParamDescriptor("intensity", "Яркость (интенсивность)", "%", 10.0, 100.0, 5.0, 65.0, decimals = 0),
            ParamDescriptor("voltage", "Напряжение U", "В", -4.0, 4.0, 0.1, 1.0, decimals = 1)
        )
        RADIOACTIVE -> listOf(
            ParamDescriptor("isotope", "Изотоп", "", 0.0, 3.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Радон-222 (быстрый)", "Йод-131 (средний)", "Углерод-14 (медленный)", "Свой период T₁/₂")),
            ParamDescriptor("halfLife", "Период полураспада T₁/₂", "с", 1.0, 20.0, 0.5, 4.0, decimals = 1),
            ParamDescriptor("nucleiCount", "Начально ядер N₀", "шт", 64.0, 400.0, 16.0, 225.0, decimals = 0)
        )
        ORBITS -> listOf(
            ParamDescriptor("starMass", "Масса звезды M", "M☉", 0.3, 3.0, 0.05, 1.0, decimals = 2),
            ParamDescriptor("orbitR", "Начальный радиус r₀", "а.е.", 0.5, 2.8, 0.05, 1.2, decimals = 2),
            ParamDescriptor("tangVel", "Начальная скорость v₀", "км/с", 8.0, 62.0, 0.5, 27.2, decimals = 1),
            ParamDescriptor("launchAngle", "Угол к касательной", "°", -35.0, 35.0, 1.0, 0.0, decimals = 0),
            ParamDescriptor("showSweptArea", "Сектора Кеплера", "", 0.0, 1.0, 1.0, 1.0, kind = ParamKind.TOGGLE, decimals = 0)
        )
    }

    fun defaultParams(): MutableMap<String, Double> =
        descriptors().associate { it.key to it.defaultValue }.toMutableMap()

    fun presets(): List<TopicPreset> = when (this) {
        BALLISTICS -> listOf(
            TopicPreset("earth", "Земля", "Бросок в воздухе Земли", mapOf("gravity" to 9.81, "airDrag" to 0.18, "wind" to 0.0)),
            TopicPreset("moon", "Луна", "Вакуум и слабое притяжение", mapOf("gravity" to 1.62, "airDrag" to 0.0, "wind" to 0.0)),
            TopicPreset("vacuum45", "Вакуум 45°", "Эталонная парабола", mapOf("angle" to 45.0, "height" to 0.0, "airDrag" to 0.0, "wind" to 0.0))
        )
        PENDULUM -> listOf(
            TopicPreset("math", "Нитяной 1.4 м", "Классический маятник", mapOf("mode" to 0.0, "length" to 1.4, "angle0" to 30.0, "damping" to 0.02, "driveAmp" to 0.0)),
            TopicPreset("spring", "Пружинный", "Груз на пружине k=24", mapOf("mode" to 1.0, "mass" to 1.5, "stiffness" to 24.0, "angle0" to 45.0, "damping" to 0.03)),
            TopicPreset("resonance", "Резонанс", "Совпадение ω = ω₀", mapOf("mode" to 0.0, "length" to 1.4, "angle0" to 10.0, "damping" to 0.08, "driveAmp" to 3.2, "driveFreq" to 2.65))
        )
        COLLISIONS -> listOf(
            TopicPreset("elastic", "Упругий (e=1)", "Импульс и энергия сохранены", mapOf("m1" to 3.0, "v1" to 5.0, "m2" to 1.5, "v2" to -2.0, "restitution" to 1.0)),
            TopicPreset("inelastic", "Слипание (e=0)", "Абсолютно неупругий удар", mapOf("m1" to 3.0, "v1" to 6.0, "m2" to 3.0, "v2" to 0.0, "restitution" to 0.0)),
            TopicPreset("newton", "Равные массы", "Передача скорости шару", mapOf("m1" to 2.0, "v1" to 6.0, "m2" to 2.0, "v2" to 0.0, "restitution" to 1.0))
        )
        BUOYANCY -> listOf(
            TopicPreset("wood_water", "Дерево в воде", "Всплытие (ρ = 650 < 1000)", mapOf("liquidType" to 0.0, "liquidDensity" to 1000.0, "bodyDensity" to 650.0, "holdSensor" to 0.0)),
            TopicPreset("iron_water", "Железо в воде", "Тонет (ρ = 7800 > 1000)", mapOf("liquidType" to 0.0, "liquidDensity" to 1000.0, "bodyDensity" to 7800.0, "holdSensor" to 0.0)),
            TopicPreset("iron_mercury", "Железо в ртути", "Тяжёлое железо плавает!", mapOf("liquidType" to 3.0, "liquidDensity" to 13600.0, "bodyDensity" to 7800.0, "holdSensor" to 0.0)),
            TopicPreset("sensor", "На динамометре", "Замер веса в воде и воздухе", mapOf("liquidType" to 0.0, "liquidDensity" to 1000.0, "bodyDensity" to 2500.0, "holdSensor" to 1.0))
        )
        INCLINED_PLANE -> listOf(
            TopicPreset("slide", "Скольжение 35°", "Угол больше угла трения", mapOf("slopeAngle" to 35.0, "frictionMu" to 0.25, "pullForce" to 0.0)),
            TopicPreset("rest", "Трение покоя 12°", "Брусок удерживается трением", mapOf("slopeAngle" to 12.0, "frictionMu" to 0.35, "pullForce" to 0.0)),
            TopicPreset("pull", "Подъём тягой", "Работа силы и расчёт КПД", mapOf("slopeAngle" to 25.0, "mass" to 4.0, "frictionMu" to 0.2, "pullForce" to 32.0))
        )
        CIRCUITS -> listOf(
            TopicPreset("series", "Последовательная", "Одинаковый ток", mapOf("topology" to 0.0, "emf" to 12.0, "r1" to 10.0, "r2" to 14.0, "switchClosed" to 1.0)),
            TopicPreset("parallel", "Параллельная", "Одинаковое напряжение", mapOf("topology" to 1.0, "emf" to 12.0, "r1" to 10.0, "r2" to 20.0, "switchClosed" to 1.0)),
            TopicPreset("rc", "Заряд RC", "Плавный заряд конденсатора", mapOf("topology" to 2.0, "emf" to 12.0, "r1" to 25.0, "capacitance" to 60.0, "switchClosed" to 1.0))
        )
        ELECTROSTATICS -> listOf(
            TopicPreset("crt", "Отклонение в E", "Парабола в конденсаторе", mapOf("fieldMode" to 0.0, "charge" to 1.0, "v0" to 10.0, "eField" to 7.0, "bField" to 0.0)),
            TopicPreset("cyclotron", "Циклотрон (B)", "Окружность Лоренца", mapOf("fieldMode" to 1.0, "charge" to 1.0, "v0" to 9.0, "eField" to 0.0, "bField" to 8.0)),
            TopicPreset("selector", "Фильтр E⊥B", "Баланс сил: прямой луч", mapOf("fieldMode" to 2.0, "charge" to 1.0, "v0" to 10.0, "eField" to 8.0, "bField" to 8.0))
        )
        ELECTROMAGNETIC -> listOf(
            TopicPreset("slow", "Медленно (0.6 Гц)", "Небольшая ЭДС индукции", mapOf("autoOscillate" to 1.0, "turns" to 60.0, "magStrength" to 1.0, "freq" to 0.6)),
            TopicPreset("fast", "Быстро (2.0 Гц)", "Всплеск ЭДС и тока!", mapOf("autoOscillate" to 1.0, "turns" to 150.0, "magStrength" to 1.8, "freq" to 2.0)),
            TopicPreset("manual", "Ручной магнит", "Двигай магнит пальцем!", mapOf("autoOscillate" to 0.0, "turns" to 100.0, "magStrength" to 1.5))
        )
        IDEAL_GAS -> listOf(
            TopicPreset("isotherm", "Изотерма", "PV = const (T=300К)", mapOf("processMode" to 0.0, "temperature" to 300.0, "volume" to 5.0)),
            TopicPreset("isobar", "Изобара", "Нагрев расширяет поршень", mapOf("processMode" to 2.0, "temperature" to 350.0, "volume" to 5.0)),
            TopicPreset("adiabat", "Адиабата", "Сжатие греет газ", mapOf("processMode" to 3.0, "temperature" to 300.0, "volume" to 7.0))
        )
        OPTICS -> listOf(
            TopicPreset("conv", "Линза d>2F", "Уменьшенное перевёрнутое", mapOf("optMode" to 0.0, "focalLen" to 15.0, "objDist" to 40.0)),
            TopicPreset("loupe", "Лупа (d<F)", "Мнимое увеличенное", mapOf("optMode" to 0.0, "focalLen" to 22.0, "objDist" to 12.0)),
            TopicPreset("tir", "Полное отражение", "Стекло→Воздух (α>41°)", mapOf("optMode" to 1.0, "n1" to 1.52, "n2" to 1.00, "incidentAngle" to 48.0, "dispersion" to 0.0)),
            TopicPreset("prism", "Дисперсия", "Спектр радуги", mapOf("optMode" to 1.0, "n1" to 1.00, "n2" to 1.65, "incidentAngle" to 55.0, "dispersion" to 1.0))
        )
        WAVES -> listOf(
            TopicPreset("standing2", "2-я гармоника", "Узел в центре струны", mapOf("waveMode" to 0.0, "frequency" to 2.0, "waveSpeed" to 8.0)),
            TopicPreset("standing4", "4-я гармоника", "5 узлов на струне", mapOf("waveMode" to 0.0, "frequency" to 4.0, "waveSpeed" to 8.0)),
            TopicPreset("double_slit", "Интерференция", "Полосы на экране", mapOf("waveMode" to 1.0, "frequency" to 3.5, "waveSpeed" to 7.0, "slitDist" to 2.6, "phaseShift" to 0.0))
        )
        PHOTOELECTRIC -> listOf(
            TopicPreset("uv_cesium", "Синий/УФ на Цезий", "Мощный поток электронов", mapOf("cathodeMetal" to 0.0, "wavelengthNm" to 360.0, "intensity" to 80.0, "voltage" to 1.5)),
            TopicPreset("red_limit", "Красный свет (нет тока)", "Ниже красной границы!", mapOf("cathodeMetal" to 0.0, "wavelengthNm" to 680.0, "intensity" to 100.0, "voltage" to 2.0)),
            TopicPreset("stopping", "Задерживающий U<0", "Разворот электронов у анода", mapOf("cathodeMetal" to 0.0, "wavelengthNm" to 320.0, "intensity" to 70.0, "voltage" to -2.2))
        )
        RADIOACTIVE -> listOf(
            TopicPreset("radon", "Быстрый (T½=3с)", "Наглядный распад за 15с", mapOf("isotope" to 0.0, "halfLife" to 3.0, "nucleiCount" to 225.0)),
            TopicPreset("iodine", "Средний (T½=7с)", "Медицинский изотоп I-131", mapOf("isotope" to 1.0, "halfLife" to 7.0, "nucleiCount" to 256.0)),
            TopicPreset("carbon", "Медленный (T½=15с)", "Радиоуглеродный метод", mapOf("isotope" to 2.0, "halfLife" to 15.0, "nucleiCount" to 324.0))
        )
        ORBITS -> listOf(
            TopicPreset("circle", "Круговая (v₁)", "Стабильная орбита", mapOf("starMass" to 1.0, "orbitR" to 1.2, "tangVel" to 27.2, "launchAngle" to 0.0)),
            TopicPreset("ellipse", "Эллипс Кеплера", "Разгон в перигелии", mapOf("starMass" to 1.0, "orbitR" to 1.4, "tangVel" to 31.5, "launchAngle" to 8.0)),
            TopicPreset("escape", "Улёт (v ≥ v₂)", "Вторая космическая", mapOf("starMass" to 1.0, "orbitR" to 1.0, "tangVel" to 43.0, "launchAngle" to 0.0))
        )
    }

    fun labTasks(): List<LabTask> = when (this) {
        BALLISTICS -> listOf(
            LabTask("b1", "Выключи воздух (C_d=0) и проверь, при каком угле дальность максимальна."),
            LabTask("b2", "Включи воздух и сравни дальность со следом вакуума."),
            LabTask("b3", "Включи «Луна» и зафиксируй замер в таблицу.")
        )
        PENDULUM -> listOf(
            LabTask("p1", "Измерь период T при L = 1.4 м, затем измени массу m и убедись, что T не изменился."),
            LabTask("p2", "Переключись на пружинный маятник и проверь зависимость T от массы m."),
            LabTask("p3", "Включи сценарий «Резонанс» и пронаблюдай рост амплитуды.")
        )
        COLLISIONS -> listOf(
            LabTask("c1", "При упругом ударе (e=1) сравни суммарный импульс P до и после удара."),
            LabTask("c2", "Выставь e = 0 (неупругий удар) и запиши потерю энергии ΔE.")
        )
        BUOYANCY -> listOf(
            LabTask("bu1", "Проверь, при какой плотности ρ_т тело начинает тонуть в воде (ρ_ж = 1000)."),
            LabTask("bu2", "Погрузи железо в ртуть — объясни, почему оно всплывает."),
            LabTask("bu3", "Включи динамометр и сравни силу тяжести с силой Архимеда.")
        )
        INCLINED_PLANE -> listOf(
            LabTask("ip1", "Плавно увеличивай угол α от 5°, пока брусок не преодолеет трение покоя."),
            LabTask("ip2", "Проверь равенство tg(α_срыва) ≈ μ и запиши результат."),
            LabTask("ip3", "Включи силу тяги вверх и посмотри КПД η на приборах.")
        )
        CIRCUITS -> listOf(
            LabTask("ce1", "Сравни ток I и сопротивление при последовательной и параллельной схемах."),
            LabTask("ce2", "Переключись в RC-цепь, разомкни ключ и пронаблюдай разряд конденсатора.")
        )
        ELECTROSTATICS -> listOf(
            LabTask("el1", "В режиме конденсатора смени знак заряда q и пронаблюдай разворот параболы."),
            LabTask("el2", "В циклотроне увеличь поле B и проверь, как уменьшается радиус окружности."),
            LabTask("el3", "В фильтре скоростей подбери E и B так, чтобы заряд летел ровно прямо.")
        )
        ELECTROMAGNETIC -> listOf(
            LabTask("em1", "Увеличь скорость f или число витков N — зафиксируй пик ЭДС индукции."),
            LabTask("em2", "Останови магнит (выключи автоколебание) — убедись, что при неподвижном магните ЭДС = 0."),
            LabTask("em3", "Поводи магнитом пальцем через катушку туда-обратно, следя за знаком тока.")
        )
        IDEAL_GAS -> listOf(
            LabTask("g1", "В изотерме сожми объём вдвое и убедись, что давление P выросло вдвое."),
            LabTask("g2", "В адиабате быстро сожми поршень и проследи за ростом температуры T.")
        )
        OPTICS -> listOf(
            LabTask("o1", "Поставь предмет ближе фокуса (d < F) и получи мнимое увеличенное изображение (лупа)."),
            LabTask("o2", "В режиме Снеллиуса найди угол полного внутреннего отражения для стекла → воздуха.")
        )
        WAVES -> listOf(
            LabTask("w1", "Подбери частоту f так, чтобы на струне уложились 2, 3 и 4 полуволны."),
            LabTask("w2", "В интерференции сдвинь фазу Δφ на 180° и пронаблюдай сдвиг полос.")
        )
        PHOTOELECTRIC -> listOf(
            LabTask("ph1", "Найди красную границу фотоэффекта для Цезия (плавно увеличивая λ до остановки тока)."),
            LabTask("ph2", "Сравни поведение при увеличении яркости и при уменьшении λ."),
            LabTask("ph3", "Подай отрицательное напряжение U до полной остановки электронов (U_з).")
        )
        RADIOACTIVE -> listOf(
            LabTask("ra1", "Запусти распад и измерь по времени, сколько ядер осталось через 1 и 2 периода T₁/₂."),
            LabTask("ra2", "Сравни плавность кривой N(t) при N₀ = 64 и N₀ = 400 ядер.")
        )
        ORBITS -> listOf(
            LabTask("or1", "Задай v = 32 км/с и по секторам Кеплера проверь ускорение в перигелии."),
            LabTask("or2", "Найди скорость ухода (v ≥ v₂), при которой орбита становится незамкнутой.")
        )
    }

    companion object {
        /**
         * Автоматические лабораторные серии для старшей школы.
         * Каждый этап — реальный прогон PhysicsEngine с заданными параметрами;
         * снимки сохраняются как обычные измерения комнаты и входят в текстовый отчёт.
         */
        fun autoLabWorks10To11(): List<AutoLabWork> = listOf(
            AutoLabWork(
                "auto10_impulse", "Авто №10.1: Импульс и энергия при столкновении", "10 класс",
                "Автоматически сравнить упругий и неупругий удар на воздушной дорожке.", COLLISIONS,
                "В замкнутой системе импульс сохраняется в обоих опытах; кинетическая энергия сохраняется только при e = 1.",
                listOf(
                    AutoLabStep("a10i_elastic", "Упругий удар e = 1", "Прогнать шары до столкновения и снять скорости после удара.", mapOf("m1" to 3.0, "v1" to 5.0, "m2" to 1.5, "v2" to -2.0, "restitution" to 1.0, "friction" to 0.0), 1.45),
                    AutoLabStep("a10i_inelastic", "Неупругий удар e = 0", "Повторить опыт со слипанием шаров и записать потерю энергии.", mapOf("m1" to 3.0, "v1" to 5.0, "m2" to 1.5, "v2" to -2.0, "restitution" to 0.0, "friction" to 0.0), 1.45)
                )
            ),
            AutoLabWork(
                "auto10_pendulum", "Авто №10.2: Период математического маятника", "10 класс",
                "Проверить зависимость периода T от длины нити L при постоянном g.", PENDULUM,
                "Период растёт как √L и не зависит от массы груза: T = 2π√(L/g).",
                listOf(
                    AutoLabStep("a10p_l08", "Нить L = 0,80 м", "Снять период колебаний маятника с короткой нитью.", mapOf("mode" to 0.0, "length" to 0.80, "mass" to 1.0, "angle0" to 16.0, "damping" to 0.0), 5.9),
                    AutoLabStep("a10p_l14", "Нить L = 1,40 м", "Увеличить длину и повторить измерение периода.", mapOf("mode" to 0.0, "length" to 1.40, "mass" to 1.0, "angle0" to 16.0, "damping" to 0.0), 7.8),
                    AutoLabStep("a10p_mass", "Контроль массы m = 4 кг", "Изменить только массу — период должен остаться тем же.", mapOf("mode" to 0.0, "length" to 1.40, "mass" to 4.0, "angle0" to 16.0, "damping" to 0.0), 7.8)
                )
            ),
            AutoLabWork(
                "auto10_gas", "Авто №10.3: Закон Бойля—Мариотта", "10 класс",
                "Получить серию P(V) для изотермического сжатия идеального газа.", IDEAL_GAS,
                "При неизменной температуре произведение P·V постоянно: уменьшение V вдвое удваивает давление.",
                listOf(
                    AutoLabStep("a10g_v8", "Объём V = 8,0 л", "Снять давление в исходном широком сосуде.", mapOf("processMode" to 0.0, "temperature" to 300.0, "volume" to 8.0, "particles" to 100.0), 0.10),
                    AutoLabStep("a10g_v5", "Объём V = 5,0 л", "Сжать газ при постоянной температуре и снять давление.", mapOf("processMode" to 0.0, "temperature" to 300.0, "volume" to 5.0, "particles" to 100.0), 0.10),
                    AutoLabStep("a10g_v4", "Объём V = 4,0 л", "Продолжить изотермическое сжатие до половины исходного объёма.", mapOf("processMode" to 0.0, "temperature" to 300.0, "volume" to 4.0, "particles" to 100.0), 0.10)
                )
            ),
            AutoLabWork(
                "auto10_ohm", "Авто №10.4: Закон Ома для участков цепи", "10 класс",
                "Сравнить ток и эквивалентное сопротивление в последовательной и параллельной цепях.", CIRCUITS,
                "При параллельном соединении эквивалентное сопротивление меньше, поэтому ток источника больше, чем при последовательном.",
                listOf(
                    AutoLabStep("a10o_series", "Последовательное соединение", "Записать I для R₁ = 10 Ом и R₂ = 20 Ом.", mapOf("topology" to 0.0, "switchClosed" to 1.0, "emf" to 12.0, "rInt" to 0.0, "r1" to 10.0, "r2" to 20.0), 0.10),
                    AutoLabStep("a10o_parallel", "Параллельное соединение", "Переключить те же резисторы параллельно и снять ток.", mapOf("topology" to 1.0, "switchClosed" to 1.0, "emf" to 12.0, "rInt" to 0.0, "r1" to 10.0, "r2" to 20.0), 0.10),
                    AutoLabStep("a10o_internal", "Учёт внутреннего сопротивления", "Добавить r = 2 Ом и увидеть падение тока источника.", mapOf("topology" to 0.0, "switchClosed" to 1.0, "emf" to 12.0, "rInt" to 2.0, "r1" to 10.0, "r2" to 20.0), 0.10)
                )
            ),
            AutoLabWork(
                "auto10_waves", "Авто №10.5: Стоячие волны и гармоники", "10 класс",
                "Построить три режима стоячей волны на струне фиксированной длины.", WAVES,
                "При постоянной скорости волны рост частоты уменьшает λ = v/f, поэтому на струне укладывается больше полуволн.",
                listOf(
                    AutoLabStep("a10w_h2", "2-я гармоника", "Задать частоту, при которой на струне видны два полуволновых сегмента.", mapOf("waveMode" to 0.0, "frequency" to 1.6, "waveSpeed" to 16.0, "amplitude" to 5.0, "damping" to 0.0), 0.60),
                    AutoLabStep("a10w_h3", "3-я гармоника", "Повысить частоту до трёх сегментов.", mapOf("waveMode" to 0.0, "frequency" to 2.4, "waveSpeed" to 16.0, "amplitude" to 5.0, "damping" to 0.0), 0.60),
                    AutoLabStep("a10w_h4", "4-я гармоника", "Повысить частоту до четырёх сегментов.", mapOf("waveMode" to 0.0, "frequency" to 3.2, "waveSpeed" to 16.0, "amplitude" to 5.0, "damping" to 0.0), 0.60)
                )
            ),
            AutoLabWork(
                "auto10_lorentz", "Авто №10.6: Сила Лоренца и радиус траектории", "10 класс",
                "Сравнить движение заряда в магнитном поле при трёх значениях B.", ELECTROSTATICS,
                "При неизменной скорости радиус циклотрона обратно пропорционален B: R = mv/(|q|B).",
                listOf(
                    AutoLabStep("a10l_b4", "Поле B = 4 мТл", "Прогнать заряд в слабом поле и снять радиус траектории.", mapOf("fieldMode" to 1.0, "charge" to 1.0, "v0" to 9.0, "eField" to 0.0, "bField" to 4.0, "massNum" to 1.5), 0.80),
                    AutoLabStep("a10l_b8", "Поле B = 8 мТл", "Удвоить B, не меняя скорость заряда.", mapOf("fieldMode" to 1.0, "charge" to 1.0, "v0" to 9.0, "eField" to 0.0, "bField" to 8.0, "massNum" to 1.5), 0.80),
                    AutoLabStep("a10l_b12", "Поле B = 12 мТл", "Повторить в сильном поле.", mapOf("fieldMode" to 1.0, "charge" to 1.0, "v0" to 9.0, "eField" to 0.0, "bField" to 12.0, "massNum" to 1.5), 0.80)
                )
            ),
            AutoLabWork(
                "auto11_induction", "Авто №11.1: Закон Фарадея—Ленца", "11 класс",
                "Исследовать зависимость ЭДС индукции от скорости магнита и числа витков катушки.", ELECTROMAGNETIC,
                "ЭДС индукции возрастает при быстром изменении потока и при увеличении числа витков: ε = −N·ΔΦ/Δt.",
                listOf(
                    AutoLabStep("a11e_slow", "Медленное движение f = 0,6 Гц", "Снять ЭДС при 60 витках и медленном движении магнита.", mapOf("autoOscillate" to 1.0, "turns" to 60.0, "magStrength" to 1.2, "freq" to 0.6, "coilRes" to 10.0), 0.60),
                    AutoLabStep("a11e_fast", "Быстрое движение f = 2,0 Гц", "Увеличить скорость изменения магнитного потока.", mapOf("autoOscillate" to 1.0, "turns" to 60.0, "magStrength" to 1.2, "freq" to 2.0, "coilRes" to 10.0), 0.60),
                    AutoLabStep("a11e_turns", "120 витков, f = 2,0 Гц", "Удвоить число витков и повторить измерение.", mapOf("autoOscillate" to 1.0, "turns" to 120.0, "magStrength" to 1.2, "freq" to 2.0, "coilRes" to 10.0), 0.60)
                )
            ),
            AutoLabWork(
                "auto11_lens", "Авто №11.2: Формула тонкой линзы", "11 класс",
                "Автоматически построить изображение предмета при трёх расстояниях до собирающей линзы.", OPTICS,
                "При d > F изображение действительное и перевёрнутое; при d < F оно становится мнимым, прямым и увеличенным.",
                listOf(
                    AutoLabStep("a11ln_far", "Предмет d = 50 см", "Снять положение уменьшенного действительного изображения.", mapOf("optMode" to 0.0, "focalLen" to 15.0, "objDist" to 50.0, "objHeight" to 8.0), 0.10),
                    AutoLabStep("a11ln_2f", "Предмет d = 30 см = 2F", "Получить изображение того же размера в точке 2F.", mapOf("optMode" to 0.0, "focalLen" to 15.0, "objDist" to 30.0, "objHeight" to 8.0), 0.10),
                    AutoLabStep("a11ln_loupe", "Предмет d = 10 см < F", "Перевести линзу в режим лупы.", mapOf("optMode" to 0.0, "focalLen" to 15.0, "objDist" to 10.0, "objHeight" to 8.0), 0.10)
                )
            ),
            AutoLabWork(
                "auto11_snell", "Авто №11.3: Преломление и полное отражение", "11 класс",
                "Проверить закон Снеллиуса и определить переход к полному внутреннему отражению.", OPTICS,
                "При переходе стекло → воздух существует критический угол; выше него луч не преломляется, а полностью отражается.",
                listOf(
                    AutoLabStep("a11s_30", "Падение α = 30°", "Снять угол преломления на границе стекло → воздух.", mapOf("optMode" to 1.0, "n1" to 1.52, "n2" to 1.00, "incidentAngle" to 30.0, "dispersion" to 0.0), 0.10),
                    AutoLabStep("a11s_40", "Падение α = 40°", "Приблизиться к критическому углу.", mapOf("optMode" to 1.0, "n1" to 1.52, "n2" to 1.00, "incidentAngle" to 40.0, "dispersion" to 0.0), 0.10),
                    AutoLabStep("a11s_50", "Падение α = 50°", "Зафиксировать полное внутреннее отражение.", mapOf("optMode" to 1.0, "n1" to 1.52, "n2" to 1.00, "incidentAngle" to 50.0, "dispersion" to 0.0), 0.10)
                )
            ),
            AutoLabWork(
                "auto11_photoelectric", "Авто №11.4: Красная граница фотоэффекта", "11 класс",
                "Сравнить фототок цезия для УФ, синего и красного света.", PHOTOELECTRIC,
                "Фотоэффект возможен лишь при энергии фотона hc/λ выше работы выхода; яркость меняет число электронов, а цвет — их энергию.",
                listOf(
                    AutoLabStep("a11ph_uv", "УФ λ = 320 нм", "Снять фототок при энергии фотона существенно выше работы выхода.", mapOf("cathodeMetal" to 0.0, "wavelengthNm" to 320.0, "intensity" to 70.0, "voltage" to 1.0), 0.80),
                    AutoLabStep("a11ph_blue", "Синий λ = 460 нм", "Повторить для видимого света выше красной границы цезия.", mapOf("cathodeMetal" to 0.0, "wavelengthNm" to 460.0, "intensity" to 70.0, "voltage" to 1.0), 0.80),
                    AutoLabStep("a11ph_red", "Красный λ = 680 нм", "Зафиксировать прекращение фототока выше красной границы.", mapOf("cathodeMetal" to 0.0, "wavelengthNm" to 680.0, "intensity" to 100.0, "voltage" to 1.0), 0.80)
                )
            ),
            AutoLabWork(
                "auto11_decay", "Авто №11.5: Закон радиоактивного распада", "11 класс",
                "Сравнить число ядер N через один и два периода полураспада.", RADIOACTIVE,
                "Случайный распад отдельных ядер в среднем даёт экспоненту N(t) = N₀·2^(−t/T₁/₂): после одного периода остаётся около половины ядер.",
                listOf(
                    AutoLabStep("a11r_start", "Начало опыта N₀ = 400", "Зафиксировать начальное количество ядер.", mapOf("isotope" to 3.0, "halfLife" to 2.0, "nucleiCount" to 400.0), 0.02),
                    AutoLabStep("a11r_half", "Через один период T₁/₂", "Прогнать модель 2 секунды и снять оставшееся число ядер.", mapOf("isotope" to 3.0, "halfLife" to 2.0, "nucleiCount" to 400.0), 2.0),
                    AutoLabStep("a11r_twohalf", "Через два периода T₁/₂", "Прогнать независимый опыт 4 секунды и сравнить с N₀/4.", mapOf("isotope" to 3.0, "halfLife" to 2.0, "nucleiCount" to 400.0), 4.0)
                )
            ),
            AutoLabWork(
                "auto11_orbits", "Авто №11.6: Орбиты и законы Кеплера", "11 класс",
                "Сравнить круговую, эллиптическую и незамкнутую орбиту при разных стартовых скоростях.", ORBITS,
                "При v = v₁ орбита почти круговая, при v₁ < v < v₂ — эллиптическая, а при v ≥ v₂ становится незамкнутой.",
                listOf(
                    AutoLabStep("a11o_circle", "Круговая орбита v = 29,8 км/с", "Прогнать планету у звезды солнечной массы с первой космической скоростью.", mapOf("starMass" to 1.0, "orbitR" to 1.0, "tangVel" to 29.785, "launchAngle" to 0.0), 2.0),
                    AutoLabStep("a11o_ellipse", "Эллиптическая орбита v = 33 км/с", "Увеличить скорость выше первой космической и снять rmin/rmax.", mapOf("starMass" to 1.0, "orbitR" to 1.0, "tangVel" to 33.0, "launchAngle" to 0.0), 2.0),
                    AutoLabStep("a11o_escape", "Траектория ухода v = 43 км/с", "Задать скорость выше второй космической.", mapOf("starMass" to 1.0, "orbitR" to 1.0, "tangVel" to 43.0, "launchAngle" to 0.0), 2.0)
                )
            )
        )

        fun readyLabWorks(): List<ReadyLabWork> = listOf(
            ReadyLabWork("lw_archimedes", "Лаб. №1: Сила Архимеда и плавание тел", "7 класс", "Изучить выталкивающую силу и условие плавания в разных жидкостях", BUOYANCY, mapOf("liquidType" to 0.0, "liquidDensity" to 1000.0, "bodyDensity" to 750.0, "holdSensor" to 0.0)),
            ReadyLabWork("lw_inclined", "Лаб. №2: Наклонная плоскость и трение покоя", "7–9 класс", "Определить угол срыва бруска и сравнить скатывающую силу с трением", INCLINED_PLANE, mapOf("slopeAngle" to 18.0, "mass" to 4.0, "frictionMu" to 0.35, "pullForce" to 0.0)),
            ReadyLabWork("lw_circuits", "Лаб. №3: Закон Ома, последовательная и параллельная цепи", "8 класс", "Проверить распределение тока и напряжения в цепях с R₁ и R₂", CIRCUITS, mapOf("topology" to 0.0, "emf" to 12.0, "r1" to 10.0, "r2" to 20.0, "switchClosed" to 1.0)),
            ReadyLabWork("lw_ballistics", "Лаб. №4: Полёт тела в воздухе и вакууме", "9 класс", "Изучить зависимость дальности от угла броска α и сопротивления воздуха", BALLISTICS, mapOf("v0" to 24.0, "angle" to 45.0, "height" to 0.0, "airDrag" to 0.18, "showVacuumRef" to 1.0)),
            ReadyLabWork("lw_pendulum", "Лаб. №5: Измерение g при помощи маятника", "9 класс", "Проверить формулу Гюйгенса T = 2π√(L/g) и независимость от массы", PENDULUM, mapOf("mode" to 0.0, "length" to 1.4, "mass" to 1.5, "angle0" to 18.0, "damping" to 0.0)),
            ReadyLabWork("lw_impulse", "Лаб. №6: Закон сохранения импульса при ударах", "10 класс", "Сравнить упругое (e=1) и неупругое (e=0) соударение шаров", COLLISIONS, mapOf("m1" to 3.0, "v1" to 5.0, "m2" to 1.5, "v2" to -2.0, "restitution" to 1.0, "friction" to 0.0)),
            ReadyLabWork("lw_gas", "Лаб. №7: Изопроцессы и адиабата в идеальном газе", "10 класс", "Исследовать закон Бойля-Мариотта и нагрев при адиабатном сжатии", IDEAL_GAS, mapOf("processMode" to 0.0, "temperature" to 300.0, "volume" to 6.0, "particles" to 80.0)),
            ReadyLabWork("lw_lorentz", "Лаб. №8: Движение заряда в магнитном поле (Лоренц)", "10–11 кл.", "Измерить зависимость радиуса циклотрона от скорости v₀ и поля B", ELECTROSTATICS, mapOf("fieldMode" to 1.0, "charge" to 1.0, "v0" to 9.0, "eField" to 0.0, "bField" to 8.0)),
            ReadyLabWork("lw_faraday", "Лаб. №9: Явление электромагнитной индукции", "11 класс", "Изучить зависимость ЭДС от скорости движения магнита и числа витков", ELECTROMAGNETIC, mapOf("autoOscillate" to 1.0, "turns" to 100.0, "magStrength" to 1.2, "freq" to 0.9)),
            ReadyLabWork("lw_optics", "Лаб. №10: Фокусное расстояние линзы и преломление", "11 класс", "Построить действительное и мнимое изображение и найти угол ПВО", OPTICS, mapOf("optMode" to 0.0, "focalLen" to 18.0, "objDist" to 32.0)),
            ReadyLabWork("lw_photo", "Лаб. №11: Законы фотоэффекта и красная граница", "11 класс", "Найти красную границу для цезия и задерживающее напряжение", PHOTOELECTRIC, mapOf("cathodeMetal" to 0.0, "wavelengthNm" to 380.0, "intensity" to 70.0, "voltage" to 1.0)),
            ReadyLabWork("lw_radio", "Лаб. №12: Закон радиоактивного распада", "11 класс", "Проверить экспоненциальный закон N(t) = N₀·2^(-t/T₁/₂)", RADIOACTIVE, mapOf("isotope" to 0.0, "halfLife" to 4.0, "nucleiCount" to 225.0))
        )
    }
}

data class Vec2(var x: Double, var y: Double)
data class TracePoint(val x: Double, val y: Double, val t: Double)
data class GasMolecule(var x: Double, var y: Double, var vx: Double, var vy: Double)
data class PhotoElectron(var x: Double, var y: Double, var vx: Double, var vy: Double, var alive: Boolean = true)
data class DecayAtom(var decayed: Boolean, var flash: Double)

data class MetricItem(
    val label: String,
    val value: String,
    val unit: String,
    val accentColor: Long
)

data class GraphChannel(
    val name: String,
    val unit: String,
    val color: Long,
    val currentValue: Double
)

data class TelemetrySnapshot(
    val simTime: Double,
    val phaseTitle: String,
    val phaseDetail: String,
    val liveFormula: String,
    val metrics: List<MetricItem>,
    val energyKinetic: Double,
    val energyPotential: Double,
    val energyLost: Double,
    val graphChannels: List<GraphChannel>,
    val pvPoint: Pair<Double, Double>? = null
)

data class ChangeLogEntry(
    val id: String,
    val simTimeSec: Double,
    val wallTimeMs: Long,
    val kind: String, // "PARAM", "EVENT", "MEASURE", "ROOM"
    val title: String,
    val detail: String
)

data class MeasurementRow(
    val index: Int,
    val simTimeSec: Double,
    val note: String,
    val values: LinkedHashMap<String, String>
)

data class LabRoom(
    val id: String,
    var name: String,
    var studentName: String,
    var goal: String,
    var topic: ExperimentTopic,
    val params: MutableMap<String, Double>,
    val completedTaskIds: MutableSet<String> = mutableSetOf(),
    val measurements: MutableList<MeasurementRow> = mutableListOf(),
    val journal: MutableList<ChangeLogEntry> = mutableListOf(),
    val createdAt: Long = System.currentTimeMillis(),
    var updatedAt: Long = System.currentTimeMillis()
)
