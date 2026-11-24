
/* ============================================================
   NEXUSAI — LOCAL STORAGE ENGINE
   File: js/storage.js

   Purpose:
   1. Initialize browser IndexedDB.
   2. Create and manage application data stores.
   3. Save, retrieve, update and delete records.
   4. Support bulk data operations.
   5. Provide LocalStorage fallback.
   6. Handle database errors gracefully.

   Database: NexusAI_DB
   Version: 1

   Stores:
   - sources
   - readings
   - anomalies
   - settings
   - datasets

   No external libraries or backend required.
   ============================================================ */

(function () {

    "use strict";

    window.NexusAI = window.NexusAI || {};

    const DB_NAME = "NexusAI_DB";
    const DB_VERSION = 1;

    const STORE_NAMES = [
        "sources",
        "readings",
        "anomalies",
        "settings",
        "datasets"
    ];

    const FALLBACK_PREFIX = "NexusAI_Storage_";

    let database = null;
    let storageMode = "uninitialized";
    let initializationPromise = null;


    /* ========================================================
       01. STORAGE AVAILABILITY
       ======================================================== */

    function isIndexedDBAvailable() {
        return typeof window.indexedDB !== "undefined";
    }

    function isLocalStorageAvailable() {

        try {
            const testKey = "__nexusai_storage_test__";

            window.localStorage.setItem(testKey, "test");
            window.localStorage.removeItem(testKey);

            return true;

        } catch (error) {
            return false;
        }

    }


    /* ========================================================
       02. INITIALIZE INDEXEDDB
       ======================================================== */

    function initializeIndexedDB() {

        return new Promise((resolve, reject) => {

            const request = window.indexedDB.open(
                DB_NAME,
                DB_VERSION
            );


            request.onupgradeneeded = function (event) {

                const db = event.target.result;


                // Monitoring sources

                if (!db.objectStoreNames.contains("sources")) {

                    db.createObjectStore("sources", {
                        keyPath: "id"
                    });

                }


                // Historical telemetry readings

                if (!db.objectStoreNames.contains("readings")) {

                    const readingsStore = db.createObjectStore(
                        "readings",
                        {
                            keyPath: "id"
                        }
                    );

                    readingsStore.createIndex(
                        "sourceId",
                        "sourceId",
                        { unique: false }
                    );

                    readingsStore.createIndex(
                        "timestamp",
                        "timestamp",
                        { unique: false }
                    );

                    readingsStore.createIndex(
                        "metric",
                        "metric",
                        { unique: false }
                    );

                }


                // Anomaly records

                if (!db.objectStoreNames.contains("anomalies")) {

                    const anomaliesStore = db.createObjectStore(
                        "anomalies",
                        {
                            keyPath: "id"
                        }
                    );

                    anomaliesStore.createIndex(
                        "sourceId",
                        "sourceId",
                        { unique: false }
                    );

                    anomaliesStore.createIndex(
                        "timestamp",
                        "timestamp",
                        { unique: false }
                    );

                }


                // Application settings

                if (!db.objectStoreNames.contains("settings")) {

                    db.createObjectStore("settings", {
                        keyPath: "id"
                    });

                }


                // Imported datasets

                if (!db.objectStoreNames.contains("datasets")) {

                    db.createObjectStore("datasets", {
                        keyPath: "id"
                    });

                }

            };


            request.onsuccess = function (event) {

                database = event.target.result;

                database.onversionchange = function () {

                    database.close();
                    database = null;

                    console.warn(
                        "NexusAI database version changed. Connection closed."
                    );

                };

                storageMode = "indexeddb";

                resolve(database);

            };


            request.onerror = function () {

                reject(
                    request.error ||
                    new Error("Unable to open NexusAI database.")
                );

            };


            request.onblocked = function () {

                console.warn(
                    "NexusAI database upgrade is blocked by another tab."
                );

            };

        });

    }


    /* ========================================================
       03. INITIALIZE STORAGE SYSTEM
       ======================================================== */

    async function init() {

        if (storageMode !== "uninitialized") {
            return getStorageInfo();
        }

        if (initializationPromise) {
            return initializationPromise;
        }

        initializationPromise = (async function () {

            if (isIndexedDBAvailable()) {

                try {

                    await initializeIndexedDB();

                    console.info(
                        "NexusAI: IndexedDB initialized successfully."
                    );

                    return getStorageInfo();

                } catch (error) {

                    console.warn(
                        "NexusAI: IndexedDB initialization failed.",
                        error
                    );

                }

            }


            if (isLocalStorageAvailable()) {

                storageMode = "localstorage";

                console.warn(
                    "NexusAI: Using LocalStorage fallback."
                );

                return getStorageInfo();

            }


            storageMode = "unavailable";

            console.error(
                "NexusAI: No supported local storage mechanism is available."
            );

            throw new Error(
                "NexusAI could not initialize local storage."
            );

        })();

        try {
            return await initializationPromise;
        } finally {
            initializationPromise = null;
        }

    }


    /* ========================================================
       04. STORAGE INFORMATION
       ======================================================== */

    function getStorageInfo() {

        return {
            database: DB_NAME,
            version: DB_VERSION,
            mode: storageMode,
            stores: [...STORE_NAMES],
            available: storageMode !== "unavailable" &&
                       storageMode !== "uninitialized"
        };

    }


    function validateStore(storeName) {

        if (!STORE_NAMES.includes(storeName)) {

            throw new Error(
                "Unknown NexusAI storage store: " + storeName
            );

        }

    }


    function ensureInitialized() {

        if (storageMode === "uninitialized") {

            throw new Error(
                "NexusAI Storage has not been initialized. Call Storage.init() first."
            );

        }

        if (storageMode === "unavailable") {

            throw new Error(
                "NexusAI local storage is unavailable."
            );

        }

    }


    /* ========================================================
       05. INDEXEDDB REQUEST HELPER
       ======================================================== */

    function runTransaction(storeName, mode, operation) {

        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    mode
                );

                const store = transaction.objectStore(storeName);

                let result;
                let operationError = null;

                transaction.oncomplete = function () {

                    if (operationError) {
                        reject(operationError);
                    } else {
                        resolve(result);
                    }

                };

                transaction.onerror = function () {

                    reject(
                        transaction.error ||
                        new Error("NexusAI database transaction failed.")
                    );

                };

                transaction.onabort = function () {

                    reject(
                        transaction.error ||
                        operationError ||
                        new Error("NexusAI database transaction was aborted.")
                    );

                };


                result = operation(store, function (value) {
                    result = value;
                });

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       06. LOCALSTORAGE HELPERS
       ======================================================== */

    function getFallbackKey(storeName) {

        return FALLBACK_PREFIX + storeName;

    }


    function readFallbackStore(storeName) {

        const rawData = window.localStorage.getItem(
            getFallbackKey(storeName)
        );

        if (!rawData) {
            return [];
        }

        try {

            const parsedData = JSON.parse(rawData);

            return Array.isArray(parsedData)
                ? parsedData
                : [];

        } catch (error) {

            console.error(
                "NexusAI: Could not read fallback data.",
                error
            );

            return [];

        }

    }


    function writeFallbackStore(storeName, records) {

        try {

            window.localStorage.setItem(
                getFallbackKey(storeName),
                JSON.stringify(records)
            );

            return true;

        } catch (error) {

            console.error(
                "NexusAI: LocalStorage write failed.",
                error
            );

            throw new Error(
                "Unable to save data. Local storage may be full or unavailable."
            );

        }

    }


    /* ========================================================
       07. GET ALL RECORDS
       ======================================================== */

    async function getAll(storeName) {

        validateStore(storeName);
        ensureInitialized();

        if (storageMode === "localstorage") {

            return readFallbackStore(storeName);

        }

        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readonly"
                );

                const request = transaction
                    .objectStore(storeName)
                    .getAll();

                request.onsuccess = function () {
                    resolve(request.result || []);
                };

                request.onerror = function () {
                    reject(request.error);
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       08. GET SINGLE RECORD
       ======================================================== */

    async function get(storeName, id) {

        validateStore(storeName);
        ensureInitialized();

        if (id === undefined || id === null) {
            throw new Error("A record ID is required.");
        }

        if (storageMode === "localstorage") {

            const records = readFallbackStore(storeName);

            return records.find(record => record.id === id) || null;

        }

        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readonly"
                );

                const request = transaction
                    .objectStore(storeName)
                    .get(id);

                request.onsuccess = function () {
                    resolve(request.result || null);
                };

                request.onerror = function () {
                    reject(request.error);
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       09. SAVE OR UPDATE RECORD
       ======================================================== */

    async function put(storeName, record) {

        validateStore(storeName);
        ensureInitialized();

        if (!record || typeof record !== "object") {
            throw new Error("A valid record is required.");
        }

        if (record.id === undefined || record.id === null) {
            throw new Error("Every record must have a unique ID.");
        }


        if (storageMode === "localstorage") {

            const records = readFallbackStore(storeName);

            const index = records.findIndex(
                item => item.id === record.id
            );

            if (index === -1) {
                records.push(record);
            } else {
                records[index] = record;
            }

            writeFallbackStore(storeName, records);

            return record;

        }


        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readwrite"
                );

                const request = transaction
                    .objectStore(storeName)
                    .put(record);

                request.onsuccess = function () {
                    resolve(record);
                };

                request.onerror = function () {
                    reject(request.error);
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       10. ADD NEW RECORD
       ======================================================== */

    async function add(storeName, record) {

        validateStore(storeName);
        ensureInitialized();

        if (!record || typeof record !== "object") {
            throw new Error("A valid record is required.");
        }

        if (record.id === undefined || record.id === null) {
            throw new Error("Every record must have a unique ID.");
        }

        const existing = await get(storeName, record.id);

        if (existing) {
            throw new Error(
                "A record with this ID already exists."
            );
        }

        return put(storeName, record);

    }


    /* ========================================================
       11. BULK SAVE
       ======================================================== */

    async function bulkPut(storeName, records) {

        validateStore(storeName);
        ensureInitialized();

        if (!Array.isArray(records)) {
            throw new Error("Bulk data must be an array.");
        }

        if (records.some(record =>
            !record ||
            typeof record !== "object" ||
            record.id === undefined ||
            record.id === null
        )) {

            throw new Error(
                "Every record in a bulk operation must have an ID."
            );

        }


        if (storageMode === "localstorage") {

            const existingRecords = readFallbackStore(storeName);

            const recordMap = new Map(
                existingRecords.map(record => [record.id, record])
            );

            records.forEach(record => {
                recordMap.set(record.id, record);
            });

            const updatedRecords = Array.from(
                recordMap.values()
            );

            writeFallbackStore(storeName, updatedRecords);

            return records.length;

        }


        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readwrite"
                );

                const store = transaction.objectStore(storeName);

                records.forEach(record => {
                    store.put(record);
                });

                transaction.oncomplete = function () {
                    resolve(records.length);
                };

                transaction.onerror = function () {
                    reject(transaction.error);
                };

                transaction.onabort = function () {
                    reject(
                        transaction.error ||
                        new Error("Bulk operation was aborted.")
                    );
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       12. DELETE RECORD
       ======================================================== */

    async function remove(storeName, id) {

        validateStore(storeName);
        ensureInitialized();

        if (id === undefined || id === null) {
            throw new Error("A record ID is required.");
        }


        if (storageMode === "localstorage") {

            const records = readFallbackStore(storeName);

            const filteredRecords = records.filter(
                record => record.id !== id
            );

            writeFallbackStore(storeName, filteredRecords);

            return true;

        }


        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readwrite"
                );

                const request = transaction
                    .objectStore(storeName)
                    .delete(id);

                request.onsuccess = function () {
                    resolve(true);
                };

                request.onerror = function () {
                    reject(request.error);
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       13. CLEAR STORE
       ======================================================== */

    async function clear(storeName) {

        validateStore(storeName);
        ensureInitialized();

        if (storageMode === "localstorage") {

            writeFallbackStore(storeName, []);

            return true;

        }

        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readwrite"
                );

                const request = transaction
                    .objectStore(storeName)
                    .clear();

                request.onsuccess = function () {
                    resolve(true);
                };

                request.onerror = function () {
                    reject(request.error);
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       14. COUNT RECORDS
       ======================================================== */

    async function count(storeName) {

        validateStore(storeName);
        ensureInitialized();

        if (storageMode === "localstorage") {

            return readFallbackStore(storeName).length;

        }

        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readonly"
                );

                const request = transaction
                    .objectStore(storeName)
                    .count();

                request.onsuccess = function () {
                    resolve(request.result);
                };

                request.onerror = function () {
                    reject(request.error);
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       15. GET RECORDS BY INDEX
       ======================================================== */

    async function getAllByIndex(storeName, indexName, value) {

        validateStore(storeName);
        ensureInitialized();

        if (storageMode === "localstorage") {

            const records = readFallbackStore(storeName);

            return records.filter(
                record => record[indexName] === value
            );

        }

        return new Promise((resolve, reject) => {

            try {

                const transaction = database.transaction(
                    storeName,
                    "readonly"
                );

                const store = transaction.objectStore(storeName);

                if (!store.indexNames.contains(indexName)) {

                    reject(
                        new Error("Unknown database index: " + indexName)
                    );

                    return;

                }

                const request = store
                    .index(indexName)
                    .getAll(value);

                request.onsuccess = function () {
                    resolve(request.result || []);
                };

                request.onerror = function () {
                    reject(request.error);
                };

            } catch (error) {

                reject(error);

            }

        });

    }


    /* ========================================================
       16. DELETE SOURCE AND ITS ASSOCIATED RECORDS
       ======================================================== */

    async function deleteSourceWithHistory(sourceId) {

        if (sourceId === undefined || sourceId === null) {
            throw new Error("A source ID is required.");
        }

        const readings = await getAllByIndex(
            "readings",
            "sourceId",
            sourceId
        );

        const anomalies = await getAllByIndex(
            "anomalies",
            "sourceId",
            sourceId
        );

        // Remove associated telemetry records.

        for (const reading of readings) {
            await remove("readings", reading.id);
        }

        // Remove associated anomaly records.

        for (const anomaly of anomalies) {
            await remove("anomalies", anomaly.id);
        }

        // Remove source configuration last.

        await remove("sources", sourceId);

        return {
            sourceId,
            deletedReadings: readings.length,
            deletedAnomalies: anomalies.length,
            deletedSource: true
        };

    }


    /* ========================================================
       17. PUBLIC STORAGE API
       ======================================================== */

    window.NexusAI.Storage = {

        init,
        getStorageInfo,

        getAll,
        get,

        put,
        add,
        bulkPut,

        remove,
        clear,
        count,

        getAllByIndex,

        deleteSourceWithHistory,

        storeNames: [...STORE_NAMES]

    };


    console.info(
        "NexusAI Storage Engine loaded."
    );

})();
