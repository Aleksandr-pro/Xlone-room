package com.xloneroom.physlab.model

enum class PhysicsBranch(val title: String, val badgeColor: Long) {
    MECHANICS("Механика", 0xFF38BDF8),
    THERMODYNAMICS("Молекулярная физика", 0xFFF97316),
    ELECTRICITY("Электричество", 0xFFFACC15),
    OPTICS("Оптика", 0xFFA855F7),
    WAVES("Колебания и волны", 0xFF2DD4BF),
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
        gradeLabel = "9–11 класс",
        mainFormula = "r(t) = r₀ + v₀t + ½at²,  F_сопр = ½ρC_dAv²",
        shortDesc = "Полёт тела под углом к горизонту с учётом сопротивления воздуха, ветра, гравитации разных планет и упругости отскока.",
        theoryNotes = "В отсутствие сопротивления воздуха траектория — симметричная парабола, а максимальная дальность достигается при α = 45° (при h₀ = 0). При наличии воздуха квадратичная сила сопротивления уменьшает высоту, дальность и делает нисходящую ветвь круче восходящей. При ударе о землю часть кинетической энергии ΔE = (1 − e²)·E_k переходит в тепло."
    ),
    PENDULUM(
        id = "pendulum",
        title = "Маятник и гармонические колебания",
        branch = PhysicsBranch.MECHANICS,
        gradeLabel = "9–11 класс",
        mainFormula = "T = 2π√(L/g),  T_пруж = 2π√(m/k),  E = E_k + E_p",
        shortDesc = "Нелинейный математический и пружинный маятник: затухание, вынужденные колебания, резонанс и замер периода.",
        theoryNotes = "При малых углах период математического маятника не зависит от массы и амплитуды (изохронность Галилея). При больших углах период растёт. Для пружинного маятника T = 2π√(m/k) не зависит от g. При совпадении частоты внешней силы ω с собственной частотой ω₀ наступает резонанс."
    ),
    COLLISIONS(
        id = "collisions",
        title = "Столкновения и импульс",
        branch = PhysicsBranch.MECHANICS,
        gradeLabel = "9–11 класс",
        mainFormula = "m₁v₁ + m₂v₂ = m₁v₁' + m₂v₂',  e = |v₂' − v₁'| / |v₁ − v₂|",
        shortDesc = "Упругие и неупругие удары двух тел на воздушной дорожке: векторы импульсов, центр масс и потеря энергии.",
        theoryNotes = "В замкнутой системе (μ = 0) суммарный импульс сохраняется при любом ударе (0 ≤ e ≤ 1). При абсолютно упругом ударе (e = 1) также сохраняется кинетическая энергия. При абсолютно неупругом (e = 0) тела движутся вместе со скоростью центра масс."
    ),
    CIRCUITS(
        id = "circuits",
        title = "Электрические цепи и закон Ома",
        branch = PhysicsBranch.ELECTRICITY,
        gradeLabel = "8–11 класс",
        mainFormula = "I = ε / (R_внеш + r),  P = I²R,  U_C(t) = ε(1 − e^(−t/RC))",
        shortDesc = "Последовательная, параллельная и RC-цепь: дрейф электронов, накал лампы, амперметр/вольтметр и заряд конденсатора.",
        theoryNotes = "Для полной цепи ток зависит от ЭДС ε, внешнего сопротивления R_внеш и внутреннего сопротивления источника r. При последовательном соединении R = R₁ + R₂, ток одинаков; при параллельном 1/R = 1/R₁ + 1/R₂, напряжение одинаково. В RC-цепи постоянная времени τ = R·C."
    ),
    IDEAL_GAS(
        id = "ideal_gas",
        title = "Идеальный газ и МКТ (поршень)",
        branch = PhysicsBranch.THERMODYNAMICS,
        gradeLabel = "10 класс",
        mainFormula = "PV = νRT,  P = ⅓nm₀v_кв²,  E_ср = (3/2)kT",
        shortDesc = "Реальное движение до 160 молекул под подвижным поршнем: изотерма, изохора, изобара, адиабата и P-V диаграмма.",
        theoryNotes = "Давление газа создаётся ударами молекул о стенки сосуда. Средняя кинетическая энергия пропорциональна абсолютной температуре T. При быстром адиабатном сжатии (без теплообмена) поршень совершает работу над газом, повышая его температуру."
    ),
    OPTICS(
        id = "optics",
        title = "Оптика: тонкая линза и Снеллиус",
        branch = PhysicsBranch.OPTICS,
        gradeLabel = "8–11 класс",
        mainFormula = "1/F = 1/d + 1/f,  n₁·sin(α) = n₂·sin(β)",
        shortDesc = "Построение изображений в собирающей и рассеивающей линзе + преломление, полное внутреннее отражение и дисперсия.",
        theoryNotes = "Собирающая линза (F > 0) при d > F даёт действительное перевёрнутое изображение, а при d < F — мнимое увеличенное (лупа). При переходе луча из более плотной среды (n₁ > n₂) и α > arcsin(n₂/n₁) возникает полное внутреннее отражение."
    ),
    WAVES(
        id = "waves",
        title = "Волны и интерференция",
        branch = PhysicsBranch.WAVES,
        gradeLabel = "9–11 класс",
        mainFormula = "λ = v / f,  Δ = d·sin(θ) = kλ (max)",
        shortDesc = "Стоячие волны на струне (узлы и пучности) и интерференционная картина от двух когерентных источников.",
        theoryNotes = "Стоячая волна образуется наложением прямой и отражённой волн; расстояние между соседними узлами равно λ/2. При интерференции от двух источников максимумы возникают там, где разность хода Δ кратна длине волны λ."
    ),
    ORBITS(
        id = "orbits",
        title = "Гравитация и законы Кеплера",
        branch = PhysicsBranch.ASTROPHYSICS,
        gradeLabel = "9–11 класс",
        mainFormula = "F = GMm/r²,  v₁ = √(GM/r),  v₂ = √(2GM/r)",
        shortDesc = "Орбитальное движение планеты вокруг звезды: круговые, эллиптические и гиперболические траектории, сектора Кеплера.",
        theoryNotes = "Первый закон Кеплера: орбита — эллипс со звездой в фокусе. Второй закон: радиус-вектор заметает равные площади за равные промежутки времени (скорость максимальна в перигелии). При v ≥ v₂ (вторая космическая) тело покидает звезду навсегда."
    );

    fun descriptors(): List<ParamDescriptor> = when (this) {
        BALLISTICS -> listOf(
            ParamDescriptor("v0", "Начальная скорость v₀", "м/с", 2.0, 60.0, 0.5, 24.0, decimals = 1, hint = "Определяет кинетическую энергию броска"),
            ParamDescriptor("angle", "Угол броска α", "°", 5.0, 89.0, 1.0, 45.0, decimals = 0, hint = "45° даёт максимум дальности в вакууме с h₀=0"),
            ParamDescriptor("height", "Начальная высота h₀", "м", 0.0, 30.0, 0.5, 2.0, decimals = 1),
            ParamDescriptor("gravity", "Ускорение g", "м/с²", 1.62, 25.0, 0.05, 9.81, decimals = 2),
            ParamDescriptor("mass", "Масса тела m", "кг", 0.2, 20.0, 0.2, 2.0, decimals = 1),
            ParamDescriptor("airDrag", "Сопротивление воздуха C_d", "", 0.0, 1.0, 0.02, 0.18, decimals = 2),
            ParamDescriptor("wind", "Ветер (по/против X)", "м/с", -20.0, 20.0, 0.5, 0.0, decimals = 1),
            ParamDescriptor("restitution", "Упругость отскока e", "", 0.0, 0.96, 0.02, 0.65, decimals = 2),
            ParamDescriptor("showVacuumRef", "Сравнивать с вакуумом", "", 0.0, 1.0, 1.0, 1.0, kind = ParamKind.TOGGLE, decimals = 0)
        )
        PENDULUM -> listOf(
            ParamDescriptor("mode", "Тип маятника", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Математический (нить)", "Пружинный (грузик)")),
            ParamDescriptor("length", "Длина нити L", "м", 0.3, 4.0, 0.05, 1.4, decimals = 2),
            ParamDescriptor("mass", "Масса груза m", "кг", 0.2, 10.0, 0.1, 1.5, decimals = 1),
            ParamDescriptor("gravity", "Гравитация g", "м/с²", 1.62, 25.0, 0.05, 9.81, decimals = 2),
            ParamDescriptor("angle0", "Нач. отклонение θ₀ / x₀", "° / дм", 4.0, 80.0, 1.0, 35.0, decimals = 0),
            ParamDescriptor("stiffness", "Жёсткость пружины k", "Н/м", 5.0, 120.0, 1.0, 24.0, decimals = 0),
            ParamDescriptor("damping", "Трение / затухание b", "", 0.0, 0.8, 0.01, 0.03, decimals = 2),
            ParamDescriptor("driveAmp", "Вынуждающая сила F₀", "Н", 0.0, 12.0, 0.2, 0.0, decimals = 1),
            ParamDescriptor("driveFreq", "Частота силы ω", "рад/с", 0.5, 10.0, 0.1, 2.6, decimals = 1)
        )
        COLLISIONS -> listOf(
            ParamDescriptor("m1", "Масса шара 1 (m₁)", "кг", 0.5, 15.0, 0.5, 3.0, decimals = 1),
            ParamDescriptor("v1", "Нач. скорость v₁", "м/с", -12.0, 12.0, 0.5, 5.0, decimals = 1),
            ParamDescriptor("m2", "Масса шара 2 (m₂)", "кг", 0.5, 15.0, 0.5, 1.5, decimals = 1),
            ParamDescriptor("v2", "Нач. скорость v₂", "м/с", -12.0, 12.0, 0.5, -2.0, decimals = 1),
            ParamDescriptor("restitution", "Упругость удара e", "", 0.0, 1.0, 0.05, 1.0, decimals = 2),
            ParamDescriptor("friction", "Трение дорожки μ", "", 0.0, 0.25, 0.01, 0.0, decimals = 2)
        )
        CIRCUITS -> listOf(
            ParamDescriptor("topology", "Схема цепи", "", 0.0, 2.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Последовательная (R₁+R₂)", "Параллельная (R₁||R₂)", "RC-цепь (конденсатор)")),
            ParamDescriptor("switchClosed", "Ключ цепи (Замкнут)", "", 0.0, 1.0, 1.0, 1.0, kind = ParamKind.TOGGLE, decimals = 0),
            ParamDescriptor("emf", "ЭДС батареи ε", "В", 1.0, 24.0, 0.5, 12.0, decimals = 1),
            ParamDescriptor("rInt", "Внутр. сопротивление r", "Ом", 0.0, 5.0, 0.1, 0.5, decimals = 1),
            ParamDescriptor("r1", "Резистор R₁", "Ом", 2.0, 100.0, 1.0, 10.0, decimals = 0),
            ParamDescriptor("r2", "Резистор R₂ / лампа", "Ом", 2.0, 100.0, 1.0, 14.0, decimals = 0),
            ParamDescriptor("capacitance", "Ёмкость C (для RC)", "мФ", 5.0, 200.0, 5.0, 40.0, decimals = 0)
        )
        IDEAL_GAS -> listOf(
            ParamDescriptor("processMode", "Термодинамический процесс", "", 0.0, 3.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Изотермический (T=const)", "Изохорный (V=const)", "Изобарный (P=const)", "Адиабатный (Q=0)")),
            ParamDescriptor("temperature", "Температура T", "К", 120.0, 900.0, 5.0, 300.0, decimals = 0),
            ParamDescriptor("volume", "Объём сосуда V", "л", 1.5, 10.0, 0.1, 5.0, decimals = 1),
            ParamDescriptor("particles", "Число молекул N", "шт", 20.0, 160.0, 5.0, 75.0, decimals = 0),
            ParamDescriptor("molarMass", "Молярная масса M", "г/моль", 2.0, 40.0, 2.0, 28.0, decimals = 0)
        )
        OPTICS -> listOf(
            ParamDescriptor("optMode", "Режим установки", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Тонкая линза", "Преломление (Снеллиус)")),
            ParamDescriptor("focalLen", "Фокус линзы F (+соб / -расс)", "см", -40.0, 40.0, 1.0, 18.0, decimals = 0),
            ParamDescriptor("objDist", "Расстояние до предмета d", "см", 6.0, 70.0, 1.0, 32.0, decimals = 0),
            ParamDescriptor("objHeight", "Высота предмета h", "см", 2.0, 16.0, 0.5, 8.0, decimals = 1),
            ParamDescriptor("incidentAngle", "Угол падения α", "°", 0.0, 85.0, 1.0, 38.0, decimals = 0),
            ParamDescriptor("n1", "Показатель среды n₁", "", 1.0, 2.0, 0.01, 1.00, decimals = 2),
            ParamDescriptor("n2", "Показатель среды n₂", "", 1.0, 2.42, 0.01, 1.52, decimals = 2),
            ParamDescriptor("dispersion", "Дисперсия белого света", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.TOGGLE, decimals = 0)
        )
        WAVES -> listOf(
            ParamDescriptor("waveMode", "Режим волн", "", 0.0, 1.0, 1.0, 0.0, kind = ParamKind.CHOICE, decimals = 0, choices = listOf("Стоячая волна на струне", "Интерференция (2 источника)")),
            ParamDescriptor("frequency", "Частота колебаний f", "Гц", 0.5, 10.0, 0.1, 2.5, decimals = 1),
            ParamDescriptor("waveSpeed", "Скорость волны v", "м/с", 2.0, 24.0, 0.5, 10.0, decimals = 1),
            ParamDescriptor("amplitude", "Амплитуда A", "см", 1.0, 10.0, 0.5, 5.0, decimals = 1),
            ParamDescriptor("slitDist", "Расст. между источниками d", "м", 0.5, 6.0, 0.1, 2.4, decimals = 1),
            ParamDescriptor("phaseShift", "Сдвиг фаз Δφ", "°", 0.0, 360.0, 5.0, 0.0, decimals = 0),
            ParamDescriptor("damping", "Затухание среды", "", 0.0, 0.4, 0.02, 0.02, decimals = 2)
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
            TopicPreset("earth", "Земля (9.81)", "Стандартный бросок в воздухе Земли", mapOf("gravity" to 9.81, "airDrag" to 0.18, "wind" to 0.0)),
            TopicPreset("moon", "Луна (1.62)", "Слабое притяжение без атмосферы", mapOf("gravity" to 1.62, "airDrag" to 0.0, "wind" to 0.0)),
            TopicPreset("mars", "Марс (3.72)", "Разрежённая атмосфера Марса", mapOf("gravity" to 3.72, "airDrag" to 0.03, "wind" to -2.0)),
            TopicPreset("vacuum45", "Вакуум 45°", "Идеальная парабола без сопротивления", mapOf("angle" to 45.0, "height" to 0.0, "airDrag" to 0.0, "wind" to 0.0))
        )
        PENDULUM -> listOf(
            TopicPreset("math", "Нитяной 1.4м", "Классический математический маятник", mapOf("mode" to 0.0, "length" to 1.4, "angle0" to 30.0, "damping" to 0.02, "driveAmp" to 0.0)),
            TopicPreset("spring", "Пружина k=24", "Пружинный осциллятор", mapOf("mode" to 1.0, "mass" to 1.5, "stiffness" to 24.0, "angle0" to 45.0, "damping" to 0.03)),
            TopicPreset("resonance", "Резонанс!", "Совпадение ω = ω₀ раскачивает систему", mapOf("mode" to 0.0, "length" to 1.4, "angle0" to 10.0, "damping" to 0.08, "driveAmp" to 3.2, "driveFreq" to 2.65))
        )
        COLLISIONS -> listOf(
            TopicPreset("elastic", "Упругий (e=1)", "Сохраняются импульс и энергия", mapOf("m1" to 3.0, "v1" to 5.0, "m2" to 1.5, "v2" to -2.0, "restitution" to 1.0)),
            TopicPreset("inelastic", "Неупругий (e=0)", "Шары слипаются после удара", mapOf("m1" to 3.0, "v1" to 6.0, "m2" to 3.0, "v2" to 0.0, "restitution" to 0.0)),
            TopicPreset("newton", "Удар в покоящийся", "Равные массы, передача скорости", mapOf("m1" to 2.0, "v1" to 6.0, "m2" to 2.0, "v2" to 0.0, "restitution" to 1.0))
        )
        CIRCUITS -> listOf(
            TopicPreset("series", "Последовательная", "Одинаковый ток через R₁ и R₂", mapOf("topology" to 0.0, "emf" to 12.0, "r1" to 10.0, "r2" to 14.0, "switchClosed" to 1.0)),
            TopicPreset("parallel", "Параллельная", "Одинаковое напряжение на ветвях", mapOf("topology" to 1.0, "emf" to 12.0, "r1" to 10.0, "r2" to 20.0, "switchClosed" to 1.0)),
            TopicPreset("rc", "Заряд RC", "Экспоненциальный заряд конденсатора", mapOf("topology" to 2.0, "emf" to 12.0, "r1" to 25.0, "capacitance" to 60.0, "switchClosed" to 1.0))
        )
        IDEAL_GAS -> listOf(
            TopicPreset("isotherm", "Изотерма T=300К", "Закон Бойля-Мариотта PV = const", mapOf("processMode" to 0.0, "temperature" to 300.0, "volume" to 5.0)),
            TopicPreset("isobar", "Изобара P=const", "Нагрев расширяет поршень (V ~ T)", mapOf("processMode" to 2.0, "temperature" to 350.0, "volume" to 5.0)),
            TopicPreset("adiabat", "Адиабата Q=0", "Сжатие поршнем разогревает газ", mapOf("processMode" to 3.0, "temperature" to 300.0, "volume" to 7.0))
        )
        OPTICS -> listOf(
            TopicPreset("conv", "Собирающая d>2F", "Уменьшенное перевёрнутое изобр.", mapOf("optMode" to 0.0, "focalLen" to 15.0, "objDist" to 40.0)),
            TopicPreset("loupe", "Лупа (d<F)", "Мнимое прямое увеличенное изобр.", mapOf("optMode" to 0.0, "focalLen" to 22.0, "objDist" to 12.0)),
            TopicPreset("tir", "Полное отражение", "Стекло→Воздух при α > 41°", mapOf("optMode" to 1.0, "n1" to 1.52, "n2" to 1.00, "incidentAngle" to 48.0, "dispersion" to 0.0)),
            TopicPreset("prism", "Дисперсия", "Разложение белого света в радугу", mapOf("optMode" to 1.0, "n1" to 1.00, "n2" to 1.65, "incidentAngle" to 55.0, "dispersion" to 1.0))
        )
        WAVES -> listOf(
            TopicPreset("standing2", "2-я гармоника", "Стоячая волна с узлом в центре", mapOf("waveMode" to 0.0, "frequency" to 2.0, "waveSpeed" to 8.0)),
            TopicPreset("standing4", "4-я гармоника", "Частое колебание, 5 узлов", mapOf("waveMode" to 0.0, "frequency" to 4.0, "waveSpeed" to 8.0)),
            TopicPreset("double_slit", "Интерференция", "Полосы максимумов и минимумов", mapOf("waveMode" to 1.0, "frequency" to 3.5, "waveSpeed" to 7.0, "slitDist" to 2.6, "phaseShift" to 0.0))
        )
        ORBITS -> listOf(
            TopicPreset("circle", "Круговая (v₁)", "Идеальный баланс центробежной и F_g", mapOf("starMass" to 1.0, "orbitR" to 1.2, "tangVel" to 27.2, "launchAngle" to 0.0)),
            TopicPreset("ellipse", "Эллипс Кеплера", "Ускорение в перигелии, тормоз в афелии", mapOf("starMass" to 1.0, "orbitR" to 1.4, "tangVel" to 31.5, "launchAngle" to 8.0)),
            TopicPreset("escape", "Улёт (v ≥ v₂)", "Вторая космическая — гипербола", mapOf("starMass" to 1.0, "orbitR" to 1.0, "tangVel" to 43.0, "launchAngle" to 0.0))
        )
    }

    fun labTasks(): List<LabTask> = when (this) {
        BALLISTICS -> listOf(
            LabTask("b1", "Включите вакуум (C_d=0, h₀=0) и сравните дальность при 30°, 45° и 60°."),
            LabTask("b2", "Включите воздух (C_d=0.35) и зафиксируйте, на сколько уменьшилась дальность."),
            LabTask("b3", "Переключите гравитацию на Луну (1.62 м/с²) и сравните время полёта.")
        )
        PENDULUM -> listOf(
            LabTask("p1", "Замерьте период при L=1.0 м и L=4.0 м — проверьте увеличение T ровно в 2 раза."),
            LabTask("p2", "Измените массу груза с 0.5 кг до 5.0 кг и убедитесь в неизменности T."),
            LabTask("p3", "Включите вынуждающую силу с частотой ω = ω₀ и наблюдайте резонанс.")
        )
        COLLISIONS -> listOf(
            LabTask("c1", "При e=1.0 зафиксируйте замер до и после удара: проверьте сохранение p_общ и E_k."),
            LabTask("c2", "Поставьте e=0.0 (неупругий удар) и измерьте долю потерянной энергии ΔE_k.")
        )
        CIRCUITS -> listOf(
            LabTask("e1", "Сравните общий ток I в последовательной и параллельной цепи при тех же R₁, R₂."),
            LabTask("e2", "Откройте RC-цепь и зафиксируйте напряжение U_C на конденсаторе через τ = R₁·C.")
        )
        IDEAL_GAS -> listOf(
            LabTask("g1", "В изотермическом режиме уменьшите объём V вдвое — проверьте рост P в 2 раза."),
            LabTask("g2", "Переключите в адиабатный режим и сожмите поршень пальцем — наблюдайте нагрев.")
        )
        OPTICS -> listOf(
            LabTask("o1", "Переместите предмет к d = 2F и убедитесь, что увеличение Г = 1.0."),
            LabTask("o2", "В режиме Снеллиуса задайте n₁=1.52, n₂=1.00 и найдите критический угол полного отражения.")
        )
        WAVES -> listOf(
            LabTask("w1", "Изменяйте частоту стоячей волны f, пока не получите чёткую 3-ю и 4-ю гармоники."),
            LabTask("w2", "В интерференции сдвиньте фазу Δφ на 180° и наблюдайте сдвиг центральной полосы.")
        )
        ORBITS -> listOf(
            LabTask("k1", "Установите круговую орбиту (v₁) и проверьте постоянство r и v."),
            LabTask("k2", "Увеличьте скорость выше v₂ ≈ 42.1 км/с и зафиксируйте незамкнутую гиперболу.")
        )
    }
}

data class Vec2(var x: Double = 0.0, var y: Double = 0.0)

data class TracePoint(
    val x: Double,
    val y: Double,
    val t: Double = 0.0
)

data class GasMolecule(
    var x: Double,
    var y: Double,
    var vx: Double,
    var vy: Double
)

data class MetricItem(
    val label: String,
    val value: String,
    val unit: String = "",
    val accentColor: Long = 0xFF38BDF8
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
    val kind: String, // "PARAM" | "EVENT" | "MEASURE" | "ROOM"
    val title: String,
    val detail: String
)

data class MeasurementRow(
    val index: Int,
    val simTimeSec: Double,
    val note: String,
    val values: Map<String, String>
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
