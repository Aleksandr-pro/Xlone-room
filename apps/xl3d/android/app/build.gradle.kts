plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.xloneroom.xl3d"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.xloneroom.xl3d"
        minSdk = 24
        targetSdk = 35
        versionCode = 6
        versionName = "1.4.0"
    }

    signingConfigs {
        create("release") {
            val ksPath = System.getenv("KEYSTORE_PATH")
            if (!ksPath.isNullOrBlank()) {
                storeFile = file(ksPath)
                storePassword = System.getenv("KEYSTORE_PASS") ?: "xloneroom"
                keyAlias = System.getenv("KEY_ALIAS") ?: "xl3d"
                keyPassword = System.getenv("KEY_PASS") ?: "xloneroom"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            val ksPath = System.getenv("KEYSTORE_PATH")
            signingConfig = if (!ksPath.isNullOrBlank()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Pure Android SDK — ultra-lightweight native APK
}
