import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    id("kotlin-parcelize")
}

// Release signing for WireLens builds: reads a local, uncommitted keystore.properties
// (storeFile, storePassword, keyAlias, keyPassword) from the project root if present.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "tech.httptoolkit.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "dev.wirelens.android"
        minSdk = 21
        targetSdk = 37
        versionCode = 38
        versionName = "1.7.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        manifestPlaceholders["sentryEnabled"] = "false"
        manifestPlaceholders["sentryDsn"] = "null"
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")

            manifestPlaceholders["sentryEnabled"] = "false"
            manifestPlaceholders["sentryDsn"] = "null"
        }
    }


    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
        }
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
        compose = true
    }
    lint {
        lintConfig = file("./lint.xml")
    }
}

dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
    implementation(libs.kotlin.stdlib.jdk7)
    implementation(libs.kotlin.reflect)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.appcompat)

    // Compose
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.activity.compose)
    implementation(libs.accompanist.drawablepainter)
    implementation(libs.foundation)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.core.ktx)
    implementation(libs.constraintlayout)
    implementation(libs.localbroadcastmanager)
    implementation(libs.zxing.android.embedded) { isTransitive = false }
    implementation(libs.core)
    implementation(libs.klaxon)
    implementation(libs.okhttp)
    implementation(libs.material)
    implementation(libs.semver)
    implementation(libs.sentry.android)
    implementation(libs.slf4j.nop)
    implementation(libs.play.services.base)
    implementation(libs.installreferrer)
    implementation(libs.swiperefreshlayout)
    testImplementation(libs.junit)
    androidTestImplementation(libs.runner)
    androidTestImplementation(libs.espresso.core)
}
