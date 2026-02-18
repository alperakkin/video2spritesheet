export default class API {
    async uploadFile(file) {
        const data = new FormData();
        data.append("video", file);

        const res = await fetch("/api/upload", {
            method: "POST",
            body: data
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || "Upload failed");
        }

        const json = await res.json();
        return json;
    }

    async generate(payload) {
        try {


            const res = await fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || "Processing failed");
            }

            await res.json();
        } catch (error) {
            errorMsg.textContent = `Error: ${error.message}`;
            errorMsg.classList.add("show");
            generateBtn.disabled = false;
            isProcessing = false;
            progressSection.classList.remove("active");
        }
    }
}
